// Kept independent of React and deployment config so the full read/fallback
// protocol can be tested with real HTTP responses and injected transports.
export function createResumeFileLoader({ api, fetchImpl = fetch, fetchBlob }) {
  const links = new Map();
  const inflight = new Map();
  let generation = 0;
  const apiUrl = path => `${api.replace(/\/$/, '')}${path}`;

  async function resolve(resumeId, sourceUrl, authToken, force = false) {
    const key = JSON.stringify([resumeId, sourceUrl, authToken]);
    if (force) links.delete(key);
    const cached = links.get(key);
    if (cached && cached.until > Date.now()) return cached.value;
    if (inflight.has(key)) return inflight.get(key);
    const startGeneration = generation;
    const request = (async () => {
      const response = await fetchImpl(apiUrl(`/resume/${encodeURIComponent(resumeId)}/file-access`), {
        headers: { Authorization: `Bearer ${authToken}` }, cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Could not access resume (HTTP ${response.status})`);
      const value = await response.json();
      if (!['storage', 'drive'].includes(value.source) || !value.url || !value.fallbackUrl) {
        throw new Error('Invalid resume file response');
      }
      // Brief negative caching lets pending copies switch to Storage on revisit.
      const until = Math.min(Date.now() + (value.source === 'drive' ? 5_000 : 30_000),
        value.expiresAt ? value.expiresAt - 30_000 : Infinity);
      if (generation === startGeneration) links.set(key, { value, until });
      return value;
    })().finally(() => { if (inflight.get(key) === request) inflight.delete(key); });
    inflight.set(key, request);
    return request;
  }

  async function load({ resumeId, sourceUrl, authToken }) {
    // Resolver failures (especially 401/403/404) do not fall through to arbitrary
    // Drive URLs. The fallback is issued only after the API authorizes this row.
    let access = await resolve(resumeId, sourceUrl, authToken);
    if (access.source === 'storage') {
      try {
        // Signed links authorize themselves. Never send the ATS bearer to Storage.
        return await fetchBlob(access.url);
      } catch {
        access = await resolve(resumeId, sourceUrl, authToken, true);
        if (access.source === 'storage') {
          try { return await fetchBlob(access.url); } catch { /* Authorized Drive fallback */ }
        }
      }
    }
    try {
      return await fetchBlob(apiUrl(access.fallbackUrl), authToken);
    } catch (error) {
      // A replaced upload can invalidate a previously issued fallback version.
      if (!String(error.message).includes('409')) throw error;
      access = await resolve(resumeId, sourceUrl, authToken, true);
      return access.source === 'storage'
        ? fetchBlob(access.url)
        : fetchBlob(apiUrl(access.fallbackUrl), authToken);
    }
  }

  return { load, clear() { generation += 1; links.clear(); inflight.clear(); } };
}
