// In-memory cache for files pulled through the Drive proxy (/view/pdf, /view/image).
//
// The server now sends `Cache-Control: private, max-age=86400`, which handles
// caching across page loads. This layer covers the two things the HTTP cache
// can't:
//   1. De-duping concurrent requests for the same file — React StrictMode mounts
//      every effect twice in dev, and the resume modal can open while the page
//      behind it is still fetching the same PDF.
//   2. Skipping the fetch/decode round trip entirely on remount, so flipping
//      between candidates and back is instant rather than merely fast.
//
// Blobs are stored rather than ArrayBuffers on purpose: pdf.js detaches (neuters)
// any ArrayBuffer handed to getDocument, so a cached buffer would be unusable the
// second time. Callers ask the Blob for a fresh ArrayBuffer each use.

const MAX_ENTRIES = 12;

// Insertion-ordered, so the oldest key is always first — re-inserting on read
// gives us plain LRU eviction without a second data structure.
const blobs = new Map();
const inflight = new Map();

function remember(url, blob) {
  blobs.delete(url);
  blobs.set(url, blob);
  while (blobs.size > MAX_ENTRIES) {
    blobs.delete(blobs.keys().next().value);
  }
}

/**
 * Fetch a proxied Drive file as a Blob, reusing an in-memory copy when possible.
 * Concurrent calls for the same URL share a single request.
 */
export function fetchDriveBlob(url, authToken) {
  const cached = blobs.get(url);
  if (cached) {
    remember(url, cached);
    return Promise.resolve(cached);
  }

  const pending = inflight.get(url);
  if (pending) return pending;

  const request = fetch(
    url,
    authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : undefined
  )
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      remember(url, blob);
      return blob;
    })
    .finally(() => {
      // Only successes stay cached; a failed fetch leaves nothing behind so the
      // next mount retries instead of replaying the error forever.
      inflight.delete(url);
    });

  inflight.set(url, request);
  return request;
}

/** Drop everything — called on logout so one user's files aren't held in memory. */
export function clearDriveFileCache() {
  blobs.clear();
  inflight.clear();
}
