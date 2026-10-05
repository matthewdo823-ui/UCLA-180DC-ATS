export function buildCandidateProfilePath(resumeId, cycleId = null) {
  const id = String(resumeId || "").trim();
  if (!id) return null;

  const path = `/candidates/${encodeURIComponent(id)}`;
  const cycle = String(cycleId || "").trim();
  return cycle ? `${path}?cycleId=${encodeURIComponent(cycle)}` : path;
}

export function buildCandidateProfileState(returnTo, state = {}) {
  const source = String(returnTo || "").trim();
  return source ? { ...state, returnTo: source } : { ...state };
}
