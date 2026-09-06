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
  if (type === "coffee chat") {
    return `${normalized} Coffee Chat grade${normalized === 1 ? "" : "s"}`;
  }
  const label = type === "free response" || type === "fr" ? "FR" : type;
  return `${normalized} ${label} review${normalized === 1 ? "" : "s"}`;
}

export function formatReviewCountPair(resumeCount, freeResponseCount) {
  return `${formatReviewCount(resumeCount, "resume")} | ${formatReviewCount(freeResponseCount, "free response")}`;
}

export function formatReviewCountPairCompact(resumeCount, freeResponseCount) {
  return `${normalizeCount(resumeCount)} resume | ${normalizeCount(freeResponseCount)} FR`;
}

export function formatReviewCountPairStacked(resumeCount, freeResponseCount) {
  return `${formatReviewCount(resumeCount, "resume")}\n${formatReviewCount(freeResponseCount, "free response")}`;
}

export function formatReviewCounts(candidate) {
  return formatReviewCountPair(
    getResumeReviewCount(candidate),
    getFreeResponseReviewCount(candidate)
  );
}

export function formatReviewCountsCompact(candidate) {
  return formatReviewCountPairCompact(
    getResumeReviewCount(candidate),
    getFreeResponseReviewCount(candidate)
  );
}

export function formatReviewCountsStacked(candidate) {
  return formatReviewCountPairStacked(
    getResumeReviewCount(candidate),
    getFreeResponseReviewCount(candidate)
  );
}
