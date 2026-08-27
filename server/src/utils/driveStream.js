const axios = require('axios');
const { pipeline } = require('node:stream/promises');
const { extractDriveFileID, toDownloadURL } = require('./drive');
const { getDriveClient } = require('./googleForm');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// A Drive file's contents at a given file ID are effectively immutable for us —
// applicants upload a resume once and a re-upload lands under a new file ID (and
// therefore a new proxy URL). Letting the browser cache the bytes turns repeat
// views — reopening the resume modal, navigating back to a candidate, React
// StrictMode's double mount in dev — into zero network calls, which matters a lot
// because every miss is a round trip through us to Google.
// `private` keeps these out of shared caches: the response was authorized for one
// staff member's token and must not be served to anyone else by a proxy.
const FILE_CACHE_CONTROL = 'private, max-age=86400';

// Only ever called once we have real file bytes to send — never on an error path,
// so a 404/502 can't get baked into the browser cache for a day.
function setFileHeaders(res, contentType) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', FILE_CACHE_CONTROL);
}

function isHtmlContentType(contentType) {
  return String(contentType || '').toLowerCase().includes('text/html');
}

function looksLikeHtml(buffer) {
  const start = buffer.toString('utf8', 0, Math.min(buffer.length, 256)).trimStart().toLowerCase();
  return start.startsWith('<!doctype html') || start.startsWith('<html');
}

function driveAccessError(message, code = 'DRIVE_INACCESSIBLE') {
  const err = new Error(message);
  err.code = code;
  return err;
}

/** Write a safe response for a Drive streaming failure, including mid-stream failures. */
function sendDriveProxyError(res, err, label) {
  const expected = err.code === 'INVALID_URL' || err.code === 'DRIVE_INACCESSIBLE'
    || err.response?.status === 404 || err.response?.status === 403;
  // Log code + upstream status alongside the message: connection resets surface
  // an empty message, so message alone left most incident log lines blank and
  // indistinguishable from genuine Drive 503s.
  if (!expected) {
    console.error(
      `Proxy error (${label}):`,
      `code=${err.code || 'n/a'}`,
      `upstream=${err.response?.status ?? 'n/a'}`,
      err.message || '(no message)'
    );
  }

  if (res.headersSent) return res.destroy();
  res.setHeader('Cache-Control', 'no-store');

  if (err.code === 'INVALID_URL' || err.code === 'DRIVE_INACCESSIBLE') {
    return res.status(404).send(err.message);
  }
  if (err.response?.status === 404) return res.status(404).send('Drive file not found');
  if (err.response?.status === 403) return res.status(404).send('Drive file is not publicly accessible');
  return res.status(502).json({
    error: `Error fetching ${label} from Drive`,
    detail: err.message,
    code: err.code,
    upstreamStatus: err.response?.status,
  });
}

async function streamViaDriveApi(fileId, res, fallbackContentType) {
  let drive;
  try {
    drive = await getDriveClient();
  } catch (err) {
    // Auth/key-file/delegation failure — don't 502 the whole request; fall back
    // to the unauthenticated public-URL path, which works for link-shared files.
    console.warn('[driveStream] getDriveClient failed, falling back to public URL:', err.message);
    return false;
  }
  if (!drive) return false;

  try {
    const { data: meta } = await drive.files.get({
      fileId,
      fields: 'mimeType',
      supportsAllDrives: true,
    });
    const { data: stream } = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );
    setFileHeaders(res, meta?.mimeType || fallbackContentType);
    // Keep stream failures in this async call chain rather than allowing an
    // error emitted after `pipe()` returns to become unhandled.
    await pipeline(stream, res);
    return true;
  } catch (err) {
    const status = err?.code ?? err?.response?.status;
    // 401/unauthorized_client means the service account isn't authorized for
    // domain-wide delegation of the requested scopes — fall back to the
    // public URL rather than failing the whole request, since most of these
    // Drive files are link-shareable anyway.
    if (status === 404 || status === 403 || status === 401) return false;
    throw err;
  }
}

async function fetchPublicDriveStream(fileId) {
  const downloadUrl = toDownloadURL(fileId);
  const baseConfig = {
    maxRedirects: 5,
    headers: { 'User-Agent': USER_AGENT },
    validateStatus: (status) => status >= 200 && status < 400,
  };

  try {
    let response = await axios.get(downloadUrl, { ...baseConfig, responseType: 'stream' });
    if (!isHtmlContentType(response.headers['content-type'])) {
      return response;
    }

    response.data.destroy();

    const textResponse = await axios.get(downloadUrl, { ...baseConfig, responseType: 'text' });
    const body = typeof textResponse.data === 'string' ? textResponse.data : '';

    if (body.includes('virus scan warning')) {
      const confirm = body.match(/confirm=([0-9A-Za-z_-]+)/)?.[1];
      if (confirm) {
        return axios.get(`${downloadUrl}&confirm=${confirm}`, { ...baseConfig, responseType: 'stream' });
      }
    }

    if (body.trimStart().startsWith('<!')) {
      throw driveAccessError('Drive file is not publicly accessible');
    }

    return axios.get(downloadUrl, { ...baseConfig, responseType: 'stream' });
  } catch (err) {
    if (err.code === 'DRIVE_INACCESSIBLE') throw err;
    const status = err?.response?.status;
    if (status === 404 || status === 403) {
      throw driveAccessError('Drive file is not publicly accessible');
    }
    throw err;
  }
}

function pipeStreamWithHtmlGuard(readable, res, contentType) {
  return new Promise((resolve, reject) => {
    let headerChecked = false;

    readable.on('data', (chunk) => {
      if (!headerChecked) {
        headerChecked = true;
        if (looksLikeHtml(chunk)) {
          readable.destroy();
          reject(driveAccessError('Drive file is not publicly accessible'));
          return;
        }
        setFileHeaders(res, contentType);
      }
      res.write(chunk);
    });

    readable.on('end', () => {
      // Close the response ourselves — unlike stream.pipe(res), manual res.write()
      // never ends the response, so without this the browser receives every byte
      // but the request hangs "pending" forever (res.blob() never resolves). This
      // path is the public-URL fallback, taken whenever the Drive API is
      // unavailable (e.g. the service account lacks domain-wide delegation locally).
      if (!headerChecked) setFileHeaders(res, contentType);
      res.end();
      resolve();
    });
    readable.on('error', reject);
  });
}

async function streamViaPublicUrl(fileId, res, fallbackContentType) {
  const response = await fetchPublicDriveStream(fileId);
  const contentType = response.headers['content-type'] || fallbackContentType;
  if (isHtmlContentType(contentType)) {
    response.data.destroy();
    throw driveAccessError('Drive file is not publicly accessible');
  }
  await pipeStreamWithHtmlGuard(response.data, res, contentType);
  return true;
}

// The Drive API's thumbnailLink ends with a size token — "=s220" on the
// googleusercontent host, or "&sz=s220"/"&sz=w220" on older links. Rewrite it to
// the width we actually render so we pull ~KB instead of the multi-MB original.
function withThumbnailSize(thumbnailLink, size) {
  if (/=s\d+(-c)?$/.test(thumbnailLink)) {
    return thumbnailLink.replace(/=s\d+(-c)?$/, `=s${size}`);
  }
  if (/([?&]sz=)[sw]\d+/.test(thumbnailLink)) {
    return thumbnailLink.replace(/([?&]sz=)[sw]\d+/, `$1s${size}`);
  }
  return thumbnailLink;
}

// Authorized thumbnail: ask the Drive API for the file's thumbnailLink — which it
// only returns when our service account can actually read the file — resize it,
// and stream those bytes. Returns false (never the full original) when no
// thumbnail is available or auth is unusable, so the caller can try the cheap
// public thumbnail and ultimately fall back to the initials placeholder.
async function streamViaApiThumbnail(fileId, res, size) {
  let drive;
  try {
    drive = await getDriveClient();
  } catch (err) {
    console.warn('[driveStream] getDriveClient failed for thumbnail, falling back:', err.message);
    return false;
  }
  if (!drive) return false;

  let thumbnailLink;
  try {
    const { data: meta } = await drive.files.get({
      fileId,
      fields: 'thumbnailLink',
      supportsAllDrives: true,
    });
    thumbnailLink = meta?.thumbnailLink;
  } catch (err) {
    const status = err?.code ?? err?.response?.status;
    if (status === 404 || status === 403 || status === 401) return false;
    throw err;
  }
  if (!thumbnailLink) return false;

  // Anything that fails before setFileHeaders returns false so the caller can try
  // the public thumbnail; a failure after (mid-stream) throws, since headers are
  // already committed and we can't restart the response.
  let response;
  try {
    response = await axios.get(withThumbnailSize(thumbnailLink, size), {
      responseType: 'stream',
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
    });
  } catch {
    return false;
  }
  const contentType = response.headers['content-type'] || 'image/jpeg';
  if (isHtmlContentType(contentType)) {
    response.data.destroy();
    return false;
  }
  setFileHeaders(res, contentType);
  await pipeline(response.data, res);
  return true;
}

// Cheap unauthenticated thumbnail — bounded by sz=w, so even this fallback pulls
// KB, not MB. Works for link-shared files; for a restricted file Drive returns a
// sign-in HTML page, which the HTML guards turn into a DRIVE_INACCESSIBLE error
// and, upstream, into the initials placeholder.
async function streamViaPublicThumbnail(fileId, res, size) {
  const url = `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${size}`;
  const response = await axios.get(url, {
    responseType: 'stream',
    maxRedirects: 5,
    headers: { 'User-Agent': USER_AGENT },
    validateStatus: (status) => status >= 200 && status < 400,
  });
  const contentType = response.headers['content-type'] || 'image/jpeg';
  if (isHtmlContentType(contentType)) {
    response.data.destroy();
    throw driveAccessError('Drive thumbnail is not available');
  }
  await pipeStreamWithHtmlGuard(response.data, res, contentType);
}

// Thumbnail-only path for image/avatar views. Every branch is size-bounded; we
// never touch the full-resolution original here, because a 40–132px avatar is the
// entire reason this proxy blew the bandwidth budget.
async function streamDriveThumbnail(fileId, res, size) {
  if (await streamViaApiThumbnail(fileId, res, size)) return;
  await streamViaPublicThumbnail(fileId, res, size);
}

/**
 * Stream a Google Drive file to an Express response.
 * Tries the Drive API (service account) first, then an unauthenticated download URL.
 */
async function streamDriveFileToResponse(fileUrl, res, { fallbackContentType, thumbnailSize } = {}) {
  const fileId = extractDriveFileID(fileUrl);
  if (!fileId) {
    throw driveAccessError('Invalid Drive file URL', 'INVALID_URL');
  }

  // Image/avatar callers pass a thumbnailSize and get a size-bounded thumbnail
  // only — if none can be produced we deliberately fail (the caller renders
  // initials) rather than falling through to the multi-MB original.
  if (thumbnailSize) {
    return streamDriveThumbnail(fileId, res, thumbnailSize);
  }

  if (await streamViaDriveApi(fileId, res, fallbackContentType)) return;
  await streamViaPublicUrl(fileId, res, fallbackContentType);
}

module.exports = {
  streamDriveFileToResponse,
  sendDriveProxyError,
};
