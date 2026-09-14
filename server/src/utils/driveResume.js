const axios = require('axios');
const { getDriveClient } = require('./googleForm');
const { extractDriveFileID, isGoogleDriveFileUrl, toDownloadURL } = require('./drive');

const MAX_RESUME_BYTES = 20 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 60_000;

function resumeContentType(buffer) {
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a/.test(buffer.subarray(0, 6).toString())) return 'image/gif';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  throw new Error('Resume is not a supported PDF or image (Drive may have returned a sign-in page)');
}

async function readBoundedStream(stream, maxBytes, signal) {
  const abort = () => stream.destroy(new Error('Resume download timed out'));
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (signal.aborted) throw new Error('Resume download timed out');
    const chunks = [];
    let length = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk);
      length += bytes.length;
      if (length > maxBytes) throw new Error(`Resume exceeds the ${maxBytes}-byte download limit`);
      chunks.push(bytes);
    }
    const buffer = Buffer.concat(chunks, length);
    return { buffer, contentType: resumeContentType(buffer) };
  } finally {
    signal.removeEventListener('abort', abort);
    stream.destroy();
  }
}

// Original bytes, never a thumbnail. Both transports share an overall deadline
// and a streaming size limit, including when Content-Length is absent or wrong.
async function fetchDriveResume(fileUrl, {
  getDrive = getDriveClient, http = axios,
  maxBytes = MAX_RESUME_BYTES, timeoutMs = DOWNLOAD_TIMEOUT_MS,
} = {}) {
  if (!isGoogleDriveFileUrl(fileUrl)) throw new Error('Invalid Drive resume URL');
  const fileId = extractDriveFileID(fileUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = controller.signal;
  try {
    let drive;
    try { drive = await getDrive(); } catch { /* Use the existing link-shared fallback. */ }
    if (drive) {
      try {
        const response = await drive.files.get(
          { fileId, alt: 'media', supportsAllDrives: true },
          { responseType: 'stream', signal, timeout: timeoutMs }
        );
        return await readBoundedStream(response.data, maxBytes, signal);
      } catch (error) {
        const status = Number(error.response?.status || error.code);
        if (![401, 403, 404].includes(status)) throw error;
      }
    }
    const response = await http.get(toDownloadURL(fileId), {
      responseType: 'stream', maxRedirects: 5, signal, timeout: timeoutMs,
    });
    return await readBoundedStream(response.data, maxBytes, signal);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchDriveResume, resumeContentType, MAX_RESUME_BYTES };
