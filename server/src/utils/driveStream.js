const axios = require('axios');
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
    stream.pipe(res);
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

    readable.on('end', resolve);
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

/**
 * Stream a Google Drive file to an Express response.
 * Tries the Drive API (service account) first, then an unauthenticated download URL.
 */
async function streamDriveFileToResponse(fileUrl, res, { fallbackContentType }) {
  const fileId = extractDriveFileID(fileUrl);
  if (!fileId) {
    throw driveAccessError('Invalid Drive file URL', 'INVALID_URL');
  }

  if (await streamViaDriveApi(fileId, res, fallbackContentType)) return;
  await streamViaPublicUrl(fileId, res, fallbackContentType);
}

module.exports = {
  streamDriveFileToResponse,
};
