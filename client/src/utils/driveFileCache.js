// In-memory cache for candidate-bound document fallbacks.
//
// The server sends `Cache-Control: private, max-age=86400`, which handles caching
// across page loads. This layer covers the two things the HTTP cache can't:
//   1. De-duping concurrent requests for the same file — React StrictMode mounts
//      every effect twice in dev, and the resume modal can open while the page
//      behind it is still fetching the same PDF.
//   2. Skipping the fetch/decode round trip entirely on remount, so flipping
//      between candidates and back is instant rather than merely fast.
//
// Images and documents get separate caches because their sizes differ by two
// orders of magnitude. A single shared cache meant that opening a couple of
// multi-MB resumes evicted nearly every ~25KB avatar thumbnail, so returning to
// the scoreboard re-fetched the whole grid. Sizing them independently lets a full
// scoreboard stay resident without letting PDFs grow the heap without bound.
//
// Blobs are stored rather than ArrayBuffers on purpose: pdf.js detaches (neuters)
// any ArrayBuffer handed to getDocument, so a cached buffer would be unusable the
// second time. Callers ask the Blob for a fresh ArrayBuffer each use.

// Roughly 25KB per 320px thumbnail, so a full scoreboard of avatars costs ~10MB
// and survives navigating away and back. Documents stay small — a handful of
// multi-MB PDFs is all a grader realistically revisits.
const MAX_IMAGE_ENTRIES = 400;
const MAX_DOCUMENT_ENTRIES = 8;

// A failed fetch is remembered briefly so one broken file doesn't re-request on
// every re-render — at scoreboard scale that turned a single bad image into a
// steady stream of doomed requests. Short enough that a transient failure (an
// expired token, a rate-limited upstream) still recovers on its own.
const FAILURE_TTL_MS = 60_000;

function createBlobCache(maxEntries) {
  // Insertion-ordered, so the oldest key is always first — re-inserting on read
  // gives us plain LRU eviction without a second data structure.
  const blobs = new Map();
  const inflight = new Map();
  const failures = new Map();
  let generation = 0;

  function remember(url, blob) {
    blobs.delete(url);
    blobs.set(url, blob);
    while (blobs.size > maxEntries) {
      blobs.delete(blobs.keys().next().value);
    }
  }

  function fetchBlob(url, authToken) {
    const key = JSON.stringify([url, authToken || null]);
    const cached = blobs.get(key);
    if (cached) {
      remember(key, cached);
      return Promise.resolve(cached);
    }

    const pending = inflight.get(key);
    if (pending) return pending;

    const failedAt = failures.get(key);
    if (failedAt !== undefined) {
      if (Date.now() - failedAt < FAILURE_TTL_MS) {
        return Promise.reject(new Error('Recently failed'));
      }
      failures.delete(key);
    }

    const startGeneration = generation;
    const request = fetch(
      url,
      authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : undefined
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (startGeneration === generation) remember(key, blob);
        return blob;
      })
      .catch((err) => {
        if (startGeneration === generation) failures.set(key, Date.now());
        throw err;
      })
      .finally(() => {
        if (inflight.get(key) === request) inflight.delete(key);
      });

    inflight.set(key, request);
    return request;
  }

  return {
    fetchBlob,
    clear() {
      generation += 1;
      blobs.clear();
      inflight.clear();
      failures.clear();
    },
  };
}

const imageCache = createBlobCache(MAX_IMAGE_ENTRIES);
const documentCache = createBlobCache(MAX_DOCUMENT_ENTRIES);

/**
 * Fetch a proxied Drive image as a Blob, reusing an in-memory copy when possible.
 * Concurrent calls for the same URL share a single request.
 */
export function fetchDriveImageBlob(url, authToken) {
  return imageCache.fetchBlob(url, authToken);
}

/**
 * Fetch a proxied Drive document (PDF) as a Blob, reusing an in-memory copy when
 * possible. Concurrent calls for the same URL share a single request.
 */
export function fetchDriveDocumentBlob(url, authToken) {
  return documentCache.fetchBlob(url, authToken);
}

/** Drop everything — called on logout so one user's files aren't held in memory. */
export function clearDriveFileCache() {
  imageCache.clear();
  documentCache.clear();
}
