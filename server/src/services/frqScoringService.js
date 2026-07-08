const { FRQ_METRIC, FRQ_MAX_SCORE } = require("../constants/frq");
const { getRubricForYear, getRubricMaxScore, computeNormalizedFromAggregate } = require("../utils/rubric");

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

/**
 * Merge resume-only aggregates with FRQ grades into composite headline scores.
 * aggregateScore = source of truth (raw pts). normalizedScore/score = cosmetic % for display.
 */
function applyCompositeScoringToCandidate(candidate, {
  frqReviews = [],
  rubricConfig = null,
} = {}) {
  const resumeAggregateScore = candidate.aggregateScore ?? null;
  const resumeMax = getResumeMaxForYear(rubricConfig, candidate.year);
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

  if (frqAvg != null && resumeAggregateScore != null) {
    aggregateScore = Number((resumeAggregateScore + frqAvg).toFixed(1));
    const compositeMax = resumeMax + FRQ_MAX_SCORE;
    normalizedScore = computeNormalizedFromAggregate(aggregateScore, compositeMax);
  }

  return {
    ...candidate,
    resumeAggregateScore,
    resumeNormalizedScore,
    resumeMax,
    aggregateScore,
    normalizedScore,
    score: normalizedScore == null ? null : Math.round(normalizedScore),
    frqPending,
    frqScore: frqAvg,
    numFrqReviews,
    frqReviews,
    categoryScores,
    compositeMax: frqPending ? resumeMax : resumeMax + FRQ_MAX_SCORE,
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
  applyCompositeScoringToCandidate,
  applyCompositeScoringToCandidates,
  appendFrqMetric,
};
