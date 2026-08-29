export function getResumeGradeCount(candidate) {
  const value = candidate?.numReviews ?? candidate?.resumeReviewCount ?? candidate?.reviewCount;
  if (Number.isFinite(Number(value))) return Number(value);
  return Array.isArray(candidate?.reviews) ? candidate.reviews.length : 0;
}

export function getFreeResponseGradeCount(candidate) {
  const value = candidate?.numFrqReviews ?? candidate?.frqReviewCount;
  if (Number.isFinite(Number(value))) return Number(value);
  return Array.isArray(candidate?.frqReviews) ? candidate.frqReviews.length : 0;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatGradeCounts(candidate, { compact = false } = {}) {
  const resume = getResumeGradeCount(candidate);
  const freeResponse = getFreeResponseGradeCount(candidate);
  if (compact) return `${resume} resume · ${freeResponse} free response`;
  return `${pluralize(resume, "resume grade")} · ${pluralize(freeResponse, "free-response grade")}`;
}
