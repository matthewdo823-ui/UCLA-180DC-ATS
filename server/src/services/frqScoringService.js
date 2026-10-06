const { FRQ_METRIC, FRQ_MAX_SCORE } = require("../constants/frq");
const {
  getRubricForYear,
  getRubricMaxScore,
  computeNormalizedFromAggregate,
  resolveCandidateResumeMax,
} = require("../utils/rubric");

function getResumeMaxForYear(rubricConfig, year) {
  const rubricForYear = getRubricForYear(rubricConfig, year);
  return getRubricMaxScore(rubricForYear);
}

function mapFrqReviewRow(row, graderLookup = {}) {
  const grader = row.graded_by != null ? graderLookup[row.graded_by] : null;
  return {
    id: row.id,
    score: Number(row.score),
    scores: { [FRQ_METRIC]: Number(row.score) },
    normalizedScore: Number(((Number(row.score) / FRQ_MAX_SCORE) * 100).toFixed(2)),
    maxScore: FRQ_MAX_SCORE,
    gradedBy: row.graded_by ?? null,
    reviewerName: grader?.name || null,
    reviewerEmail: grader?.email || null,
    notes: row.notes || "",
    submittedAt: row.submitted_at,
  };
}

function groupFrqReviewsByResumeId(frqRows, graderLookup = {}) {
  const grouped = {};
  (frqRows || []).forEach((row) => {
    const resumeId = row.resume_id;
    if (!grouped[resumeId]) grouped[resumeId] = [];
    grouped[resumeId].push(mapFrqReviewRow(row, graderLookup));
  });
  Object.values(grouped).forEach((reviews) => {
    reviews.sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
  });
  return grouped;
}

function averageFrqScore(frqReviews = []) {
  if (!frqReviews.length) return null;
  const sum = frqReviews.reduce((acc, review) => acc + (Number(review.score) || 0), 0);
  return Number((sum / frqReviews.length).toFixed(1));
}

const RESUME_WEIGHT = 2 / 3;
const FRQ_WEIGHT = 1 / 3;

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value)));
}

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

/**
 * Combine independently normalized components so every resume rubric receives
 * the same 2:1 weight relative to the FRQ, regardless of its raw point maximum.
 * If one component has not been graded yet, show the completed component alone.
 */
function computeWeightedCompositePercent(resumePercent, frqScore, frqMax = FRQ_MAX_SCORE) {
  const hasResume = hasNumericValue(resumePercent);
  const hasFrq = hasNumericValue(frqScore);
  const numericFrqMax = Number(frqMax);

  if (!hasResume && !hasFrq) return null;
  if (!hasFrq) return Number(clampPercent(resumePercent).toFixed(1));

  const frqPercent = Number.isFinite(numericFrqMax) && numericFrqMax > 0
    ? clampPercent((Number(frqScore) / numericFrqMax) * 100)
    : null;
  if (frqPercent == null) return hasResume ? Number(clampPercent(resumePercent).toFixed(1)) : null;
  if (!hasResume) return Number(frqPercent.toFixed(1));

  return Number((
    clampPercent(resumePercent) * RESUME_WEIGHT
    + frqPercent * FRQ_WEIGHT
  ).toFixed(1));
}

/**
 * Merge resume-only aggregates with FRQ grades into composite headline scores.
 * aggregateScore retains rubric arithmetic; normalizedScore/score are the
 * cross-rubric comparison values used for display and ranking.
 */
function applyCompositeScoringToCandidate(candidate, {
  frqReviews = [],
  rubricConfig = null,
} = {}) {
  const resumeAggregateScore = candidate.aggregateScore ?? null;
  const resumeMax = candidate.resumeMax
    ?? resolveCandidateResumeMax(candidate.reviews, {
      rubricConfig,
      candidateYear: candidate.year,
    })
    ?? getResumeMaxForYear(rubricConfig, candidate.year);
  const resumeNormalizedScore = candidate.normalizedScore
    ?? computeNormalizedFromAggregate(resumeAggregateScore, resumeMax)
    ?? null;
  const frqAvg = averageFrqScore(frqReviews);
  const numFrqReviews = frqReviews.length;

  const categoryScores = { ...(candidate.categoryScores || {}) };
  if (frqAvg != null) {
    categoryScores[FRQ_METRIC] = frqAvg;
  } else {
    categoryScores[FRQ_METRIC] = null;
  }

  let aggregateScore = resumeAggregateScore;
  let normalizedScore = resumeNormalizedScore;
  const frqPending = numFrqReviews === 0;
  const hasResumeScore = hasNumericValue(resumeAggregateScore);
  const hasResumeMax = Number.isFinite(Number(resumeMax)) && Number(resumeMax) > 0;
  let compositeMax = hasResumeMax ? Number(resumeMax) : null;

  if (frqAvg != null && hasResumeScore && hasResumeMax) {
    aggregateScore = Number((resumeAggregateScore + frqAvg).toFixed(1));
    compositeMax = Number(resumeMax) + FRQ_MAX_SCORE;
    normalizedScore = computeWeightedCompositePercent(resumeNormalizedScore, frqAvg);
  } else if (frqAvg != null && !hasResumeScore) {
    aggregateScore = frqAvg;
    compositeMax = FRQ_MAX_SCORE;
    normalizedScore = computeWeightedCompositePercent(null, frqAvg);
  }

  return {
    ...candidate,
    resumeAggregateScore,
    resumeNormalizedScore,
    resumeMax,
    resumeEarnedPoints: resumeAggregateScore,
    resumePossiblePoints: resumeMax,
    aggregateScore,
    normalizedScore,
    earnedPoints: aggregateScore,
    possiblePoints: compositeMax,
    score: normalizedScore == null ? null : Math.round(normalizedScore),
    frqPending,
    frqScore: frqAvg,
    numFrqReviews,
    frqReviews,
    categoryScores,
    compositeMax,
  };
}

function applyCompositeScoringToCandidates(candidates, {
  frqByResumeId = {},
  rubricConfig = null,
} = {}) {
  return (candidates || []).map((candidate) =>
    applyCompositeScoringToCandidate(candidate, {
      frqReviews: frqByResumeId[candidate.id] || [],
      rubricConfig,
    })
  );
}

function appendFrqMetric(metrics = []) {
  const list = [...metrics];
  if (!list.includes(FRQ_METRIC)) list.push(FRQ_METRIC);
  return list;
}

module.exports = {
  FRQ_METRIC,
  FRQ_MAX_SCORE,
  getResumeMaxForYear,
  mapFrqReviewRow,
  groupFrqReviewsByResumeId,
  averageFrqScore,
  computeWeightedCompositePercent,
  applyCompositeScoringToCandidate,
  applyCompositeScoringToCandidates,
  appendFrqMetric,
};
