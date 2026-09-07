import { API } from "../constants/config";

// Signed Supabase URLs are minted with a long TTL precisely so they can be reused:
// a fresh URL per render would defeat the browser's HTTP cache (same bytes, new
// URL, full re-download) and waste a round trip to mint it. Caching per candidate
// for the session keeps one URL in play for the whole visit.
//
// `null` is cached too. Before the sync worker has drained, most candidates have no
// stored headshot, and without a negative entry every avatar would re-ask on every
// mount — the same stampede the lazy-loading change just removed.
const urls = new Map();
const inflight = new Map();

/**
 * Resolve a candidate's stored headshot URL.
 * @returns {Promise<string|null>} null when the document isn't synced yet, so the
 *   caller can fall back to the Drive proxy.
 */
export function fetchHeadshotUrl(candidateId, authToken) {
  if (urls.has(candidateId)) return Promise.resolve(urls.get(candidateId));

  const pending = inflight.get(candidateId);
  if (pending) return pending;

  const request = fetch(`${API}/candidates/${candidateId}/headshot-url`, {
    headers: { Authorization: `Bearer ${authToken}` },
  })
    .then(async (res) => {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json?.url || null;
    })
    // A failure resolves to null rather than rejecting: every caller's fallback is
    // the Drive proxy, and treating "couldn't sign" the same as "not synced yet"
    // keeps that in one branch.
    .catch(() => null)
    .then((url) => {
      urls.set(candidateId, url);
      return url;
    })
    .finally(() => inflight.delete(candidateId));

  inflight.set(candidateId, request);
  return request;
}

/** Drop everything — called on logout alongside the blob caches. */
export function clearHeadshotUrlCache() {
  urls.clear();
  inflight.clear();
}
