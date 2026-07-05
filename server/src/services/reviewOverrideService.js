const supabase = require("../config/supabase");
const {
  computeRawScore,
  computeReviewNormalizedFromScores,
  computeNormalizedFromAggregate,
  getRubricForYear,
  getRubricMaxScore,
} = require("../utils/rubric");

function mapReviewOverride(row) {
  if (!row) return null;
  return {
    id: row.id,
    reviewId: row.review_id,
    overrideScores: row.override_scores && typeof row.override_scores === "object"
      ? row.override_scores
      : null,
    adminNotes: row.admin_notes || "",
    adminUserId: row.admin_user_id ?? null,
    updatedAt: row.updated_at || null,
  };
}

async function fetchReviewOverridesByReviewIds(reviewIds) {
  const ids = [...new Set((reviewIds || []).filter(Boolean))];
  if (!ids.length) return {};

  const { data, error } = await supabase
    .from("resume_review_overrides")
    .select("*")
    .in("review_id", ids);

  if (error) {
    console.warn("fetchReviewOverridesByReviewIds:", error.message);
    return {};
  }

  const lookup = {};
  (data || []).forEach((row) => {
    lookup[row.review_id] = mapReviewOverride(row);
  });
  return lookup;
}

function buildCategoryScoresFromReviews(reviews, metrics = []) {
  const totals = {};
  const counts = {};
  const metricList = metrics.length
    ? metrics
    : [...new Set((reviews || []).flatMap((review) => Object.keys(review.scores || {})))];

  (reviews || []).forEach((review) => {
    metricList.forEach((metric) => {
      const value = Number(review.scores?.[metric]);
      if (!Number.isFinite(value)) return;
      totals[metric] = (totals[metric] || 0) + value;
      counts[metric] = (counts[metric] || 0) + 1;
    });
  });

  const categoryScores = {};
  metricList.forEach((metric) => {
    const count = counts[metric] || 0;
    categoryScores[metric] = count > 0 ? Number((totals[metric] / count).toFixed(1)) : null;
  });
  return categoryScores;
}

function resolveResumeMaxScore(options = {}, candidateYear) {
  if (Number.isFinite(Number(options.resumeMaxScore)) && options.resumeMaxScore > 0) {
    return Number(options.resumeMaxScore);
  }
  if (options.rubricConfig) {
    return getRubricMaxScore(getRubricForYear(options.rubricConfig, candidateYear));
  }
  return null;
}

function applyReviewOverrideToReview(review, override, { rubricConfig, candidateYear } = {}) {
  if (!override?.overrideScores || typeof override.overrideScores !== "object") {
    return review;
  }

  const sourceScores = review.sourceScores || review.scores || {};
  const effectiveScores = override.overrideScores;
  const metrics = Object.keys(effectiveScores);
  const rawScore = computeRawScore(effectiveScores, metrics);
  const normalizedScore = computeReviewNormalizedFromScores(
    { scores: effectiveScores, rubricSnapshot: review.rubricSnapshot || null },
    { rubricConfig, candidateYear }
  );

  return {
    ...review,
    sourceScores,
    scores: effectiveScores,
    score: rawScore,
    sourceScore: computeRawScore(sourceScores, metrics),
    sourceNormalizedScore: review.sourceNormalizedScore ?? review.normalizedScore,
    normalizedScore,
    adminOverride: {
      overrideScores: override.overrideScores,
      adminNotes: override.adminNotes || "",
      updatedAt: override.updatedAt || null,
    },
  };
}

function recomputeCandidateScoresFromReviews(candidate, metrics = [], options = {}) {
  const reviews = candidate.reviews || [];
  let totalScore = 0;
  let count = 0;

  reviews.forEach((review) => {
    const raw = Number(review.score);
    if (!Number.isFinite(raw)) return;
    totalScore += raw;
    count += 1;
  });

  const aggregateScore = count > 0 ? Number((totalScore / count).toFixed(1)) : null;
  const resumeMax = resolveResumeMaxScore(options, candidate.year);
  const normalizedScore = resumeMax
    ? computeNormalizedFromAggregate(aggregateScore, resumeMax)
    : null;

  const metricList = metrics.length ? metrics : candidate.metrics || [];

  return {
    ...candidate,
    aggregateScore,
    normalizedScore,
    // Cosmetic display alias — sorting/ranking should use aggregateScore.
    score: normalizedScore == null ? null : Math.round(normalizedScore),
    categoryScores: buildCategoryScoresFromReviews(reviews, metricList),
  };
}

function applyReviewOverridesToCandidate(candidate, overrideLookup, options = {}) {
  const reviews = (candidate.reviews || []).map((review) =>
    applyReviewOverrideToReview(review, overrideLookup[review.id], options)
  );

  return recomputeCandidateScoresFromReviews(
    { ...candidate, reviews },
    options.metrics || candidate.metrics || [],
    options
  );
}

function applyReviewOverridesToCandidates(candidates, overrideLookup, options = {}) {
  return (candidates || []).map((candidate) =>
    applyReviewOverridesToCandidate(candidate, overrideLookup, {
      ...options,
      candidateYear: candidate.year,
    })
  );
}

module.exports = {
  mapReviewOverride,
  fetchReviewOverridesByReviewIds,
  applyReviewOverrideToReview,
  applyReviewOverridesToCandidate,
  applyReviewOverridesToCandidates,
};
