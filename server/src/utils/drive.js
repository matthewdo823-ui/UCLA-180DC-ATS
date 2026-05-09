function extractDriveFileID(url) {
  if (!url || typeof url !== 'string') return null;

  try {
    // Normalize
    const parsed = new URL(url);

    // 1. Check query params (?id=...)
    const idParam = parsed.searchParams.get('id');
    if (idParam) return idParam;

    // 2. Match /d/FILE_ID pattern (most common)
    const pathMatch = parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (pathMatch) return pathMatch[1];

    // 3. Match /file/d/FILE_ID (redundant but safe)
    const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch) return fileMatch[1];

    // 4. Fallback: last long token (rare edge case)
    const fallbackMatch = url.match(/[-\w]{25,}/);
    if (fallbackMatch) return fallbackMatch[0];

    return null;
  } catch (err) {
    console.error('Invalid URL:', url);
    return null;
  }
}

function toDownloadURL(fileID) {
  return `https://drive.google.com/uc?export=download&id=${fileID}`;
}

module.exports = {
  extractDriveFileID,
  toDownloadURL
};
