const supabase = require('../config/supabase');

const BUCKET = 'candidate-documents';

// Headshots render at 40–132px in the avatar grid and are never shown larger, so
// one 320px thumbnail covers the biggest retina case. This matches the size the
// live image proxy already serves, which keeps the migration behaviour-preserving.
const HEADSHOT_SIZE = 320;

// Long enough that a signed URL outlives any realistic grading session, and — more
// importantly — stable enough to be worth caching. Minting a fresh URL per request
// would defeat browser and CDN caching entirely: same bytes, new URL, full
// re-download. Callers are expected to reuse a signed URL for most of its life.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 12;

/**
 * Deterministic object path. Reprocessing the same document (which at-least-once
 * delivery guarantees will happen) overwrites one object rather than accumulating
 * copies, which is what makes worker retries safe.
 */
function documentStoragePath({ cycleId, candidateId, kind, contentType, sourceVersion }) {
  const extension = {
    'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg',
    'image/webp': 'webp', 'image/gif': 'gif',
  }[contentType];
  if (!extension || !sourceVersion) throw new Error('Document type and source version are required');
  return `${cycleId}/${candidateId}/${kind}/${sourceVersion}.${extension}`;
}

async function uploadDocument(path, buffer, contentType) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
    // A replacement receives a new source version and therefore a new URL.
    cacheControl: '86400',
  });
  if (error) throw error;
  return path;
}

/**
 * Mint a signed URL for a stored object. Returns null rather than throwing so a
 * read path can fall back to the Drive proxy instead of failing the whole request.
 */
async function getSignedUrl(path, expiresIn = SIGNED_URL_TTL_SECONDS) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.warn('[documentStorage] createSignedUrl failed:', error.message);
    return null;
  }
  return data?.signedUrl || null;
}

module.exports = {
  BUCKET,
  HEADSHOT_SIZE,
  SIGNED_URL_TTL_SECONDS,
  documentStoragePath,
  uploadDocument,
  getSignedUrl,
};
