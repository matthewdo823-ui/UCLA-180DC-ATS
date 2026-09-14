const EXCLUSION_MESSAGE = 'Automatically rejected: Junior/Senior standing. Junior transfers remain eligible.';
const ELIGIBLE_YEAR_FILTER = 'year.is.null,year.not.in.(Junior,Senior)';

function screeningExclusionReason(year) {
  const standing = String(year || '').trim().toLowerCase();
  return standing === 'junior' || standing === 'senior' ? EXCLUSION_MESSAGE : null;
}

// Presentation only: never write a fabricated grade or committee decision.
function applyScreeningEligibility(candidate, enabled = true) {
  const reason = enabled ? screeningExclusionReason(candidate?.year) || candidate?.screeningExclusionReason : null;
  if (!reason) return candidate;
  return {
    ...candidate, screeningExclusionReason: reason, gradingRequired: false,
    aggregateScore: 0, normalizedScore: 0, score: 0,
    canDecide: false,
    decision: { ...candidate.decision, status: 'reject', notes: reason, provisional: false, automatic: true },
  };
}

function screeningAccessError(candidate) {
  return screeningExclusionReason(candidate?.year) ? { error: EXCLUSION_MESSAGE, status: 409 } : null;
}
module.exports = { applyScreeningEligibility, screeningAccessError, screeningExclusionReason, EXCLUSION_MESSAGE, ELIGIBLE_YEAR_FILTER };
