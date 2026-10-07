export function sortCandidates(candidates, sort) {
  if (sort === 'default') return [...candidates];
  const key = sort === 'frq' ? 'frqReviewCount' : 'reviewCount';
  return [...candidates].sort((a, b) =>
    (Number(a[key]) || 0) - (Number(b[key]) || 0)
    || String(a.name || '').localeCompare(String(b.name || ''))
    || String(a.resumeId).localeCompare(String(b.resumeId))
  );
}
