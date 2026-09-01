const supabase = require("../config/supabase");
const {
  computeRawScore,
  computeNormalizedFromAggregate,
  getRubricForYear,
  getRubricMaxScore,
  resolveReviewScoringContext,
} = require("../utils/rubric");

function resolveOverrideScore(row) {
  if (row?.override_score != null && Number.isFinite(Number(row.override_score))) {
    return Number(row.override_score);
  }
  if (row?.override_scores && typeof row.override_scores === "object") {
    return computeRawScore(row.override_scores);
  }
  return null;
}

function mapReviewOverride(row) {
  if (!row) return null;
  const overrideScore = resolveOverrideScore(row);
  return {
    id: row.id,
    reviewId: row.review_id,
    overrideScore: overrideScore == null ? null : overrideScore,
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

function resolveReviewMaxScore(review, options = {}) {
  if (Number.isFinite(Number(review?.maxScore)) && review.maxScore > 0) {
    return Number(review.maxScore);
  }

  const context = resolveReviewScoringContext(review, {
    rubricConfig: options.rubricConfig,
    candidateYear: options.candidateYear,
  });
  if (Number.isFinite(Number(context.maxScore)) && context.maxScore > 0) {
    return Number(context.maxScore);
  }

  const metrics = Object.keys(review?.scores || {});
  return metrics.length > 0 ? metrics.length * 4 : 24;
}

function applyReviewOverrideToReview(review, override, options = {}) {
  const overrideScore = override?.overrideScore;
  const adminOverride = override
    ? {
        overrideScore: Number.isFinite(Number(overrideScore)) ? Number(overrideScore) : null,
        scoreScale: Number(override?.scoreScale) || null,
        adminNotes: override.adminNotes || "",
        updatedAt: override.updatedAt || null,
      }
    : null;

  if (!Number.isFinite(Number(overrideScore))) {
    return adminOverride ? { ...review, adminOverride } : review;
  }

  const totalOverride = Number(overrideScore);
  const sourceScores = review.sourceScores || review.scores || {};
  const metrics = Object.keys(sourceScores);
  const sourceScore = computeRawScore(sourceScores, metrics);
  const maxScore = resolveReviewMaxScore(review, options);
  const normalizedScore = computeNormalizedFromAggregate(totalOverride, maxScore);

  return {
    ...review,
    sourceScores,
    scores: sourceScores,
    score: totalOverride,
    sourceScore,
    sourceNormalizedScore: review.sourceNormalizedScore ?? review.normalizedScore,
    normalizedScore,
    adminOverride: {
      overrideScore: totalOverride,
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
