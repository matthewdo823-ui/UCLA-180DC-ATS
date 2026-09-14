const EXCLUSION_MESSAGE = 'Automatically rejected: Junior/Senior standing. Junior transfers remain eligible.';

function applyScreeningEligibility(candidate) {
  if (!candidate?.screeningExclusionReason) return candidate;
  return {
    ...candidate,
    gradingRequired: false,
    aggregateScore: 0, normalizedScore: 0, score: 0,
    canDecide: false,
    decision: { ...candidate.decision, status: 'reject', notes: candidate.screeningExclusionReason, provisional: false, automatic: true },
  };
}

function screeningAccessError(candidate) {
  return candidate?.screening_exclusion_reason ? { error: EXCLUSION_MESSAGE, status: 409 } : null;
}
module.exports = { applyScreeningEligibility, screeningAccessError, EXCLUSION_MESSAGE };
