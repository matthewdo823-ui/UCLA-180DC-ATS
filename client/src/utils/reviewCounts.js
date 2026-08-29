export function getResumeReviewCount(candidate) {
  const value = candidate?.numReviews ?? candidate?.resumeReviewCount ?? candidate?.reviewCount;
  if (Number.isFinite(Number(value))) return Number(value);
  return Array.isArray(candidate?.reviews) ? candidate.reviews.length : 0;
}

export function getFreeResponseReviewCount(candidate) {
  const value = candidate?.numFrqReviews ?? candidate?.frqReviewCount;
  if (Number.isFinite(Number(value))) return Number(value);
  return Array.isArray(candidate?.frqReviews) ? candidate.frqReviews.length : 0;
}

function normalizeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

export function formatReviewCount(count, type) {
  const normalized = normalizeCount(count);
  return `${normalized} ${type} review${normalized === 1 ? "" : "s"}`;
}

export function formatReviewCountPair(resumeCount, freeResponseCount) {
  return `${formatReviewCount(resumeCount, "resume")} | ${formatReviewCount(freeResponseCount, "free response")}`;
}

export function formatReviewCounts(candidate) {
  return formatReviewCountPair(
    getResumeReviewCount(candidate),
    getFreeResponseReviewCount(candidate)
  );
}
