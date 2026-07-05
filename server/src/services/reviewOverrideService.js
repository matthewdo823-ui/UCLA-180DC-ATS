const supabase = require("../config/supabase");

function mapReviewOverride(row) {
  if (!row) return null;
  return {
    id: row.id,
    reviewId: row.review_id,
    overrideScore: row.override_score != null ? Number(row.override_score) : null,
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

function applyReviewOverrideToReview(review, override) {
  if (!override || override.overrideScore == null) {
    return review;
  }

  const sourceNormalized = review.normalizedScore;
  return {
    ...review,
    sourceNormalizedScore: sourceNormalized,
    normalizedScore: override.overrideScore,
    adminOverride: {
      overrideScore: override.overrideScore,
      adminNotes: override.adminNotes || "",
      updatedAt: override.updatedAt || null,
    },
  };
}

function recomputeCandidateScoresFromReviews(candidate) {
  const reviews = candidate.reviews || [];
  let totalScore = 0;
  let totalNormalized = 0;
  let count = 0;

  reviews.forEach((review) => {
    const normalized = Number(review.normalizedScore);
    if (!Number.isFinite(normalized)) return;
    totalNormalized += normalized;
    totalScore += Number(review.score) || 0;
    count += 1;
  });

  const aggregateScore = count > 0 ? Number((totalScore / count).toFixed(1)) : null;
  const normalizedScore = count > 0 ? Number((totalNormalized / count).toFixed(1)) : null;

  return {
    ...candidate,
    aggregateScore,
    normalizedScore,
    score: normalizedScore == null ? null : Math.round(normalizedScore),
  };
}

function applyReviewOverridesToCandidate(candidate, overrideLookup) {
  const reviews = (candidate.reviews || []).map((review) => {
    const override = overrideLookup[review.id];
    return applyReviewOverrideToReview(review, override);
  });

  return recomputeCandidateScoresFromReviews({ ...candidate, reviews });
}

function applyReviewOverridesToCandidates(candidates, overrideLookup) {
  return (candidates || []).map((candidate) =>
    applyReviewOverridesToCandidate(candidate, overrideLookup)
  );
}

module.exports = {
  mapReviewOverride,
  fetchReviewOverridesByReviewIds,
  applyReviewOverrideToReview,
  applyReviewOverridesToCandidate,
  applyReviewOverridesToCandidates,
};
