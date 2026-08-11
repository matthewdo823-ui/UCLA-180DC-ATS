function hasFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

/**
 * Display the server-calculated shared-candidate calibration.
 *
 * The server estimates grader severity only from candidates reviewed by more
 * than one grader. This deliberately does not reshape a grader's score spread
 * or recalculate against the currently visible scoreboard population.
 */
export function equalizeCandidateScores(candidates) {
  return (candidates || []).map((candidate) => {
    const normalizedScore = hasFiniteNumber(candidate.equalizedNormalizedScore)
      ? Number(candidate.equalizedNormalizedScore)
      : candidate.normalizedScore;
    const aggregateScore = hasFiniteNumber(candidate.equalizedAggregateScore)
      ? Number(candidate.equalizedAggregateScore)
      : candidate.aggregateScore;
    const reviews = (candidate.reviews || []).map((review) => ({
      ...review,
      sourceNormalizedScore: review.normalizedScore,
      normalizedScore: hasFiniteNumber(review.calibratedNormalizedScore)
        ? Number(review.calibratedNormalizedScore)
        : review.normalizedScore,
      equalized: true,
    }));

    return {
      ...candidate,
      reviews,
      resumeAggregateScore: candidate.equalizedResumeAggregateScore ?? candidate.resumeAggregateScore,
      resumeNormalizedScore: candidate.equalizedResumeNormalizedScore ?? candidate.resumeNormalizedScore,
      aggregateScore,
      normalizedScore,
      score: normalizedScore == null ? null : Math.round(normalizedScore),
      sourceNormalizedScore: candidate.normalizedScore ?? candidate.score ?? null,
      sourceAggregateScore: candidate.aggregateScore ?? null,
      equalized: true,
    };
  });
}

export function recomputeEqualizedStats(candidates) {
  const reviewed = (candidates || []).filter((candidate) =>
    (candidate.numReviews ?? candidate.reviews?.length ?? 0) > 0
  );
  const normalizedValues = reviewed
    .map((candidate) => Number(candidate.normalizedScore ?? candidate.score))
    .filter((value) => Number.isFinite(value));
  const avgScore = normalizedValues.length
    ? Number((normalizedValues.reduce((sum, value) => sum + value, 0) / normalizedValues.length).toFixed(1))
    : 0;
  return { avgScore };
}
