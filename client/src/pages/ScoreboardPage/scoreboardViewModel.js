import { css } from "../../theme/colors";
import { getInitials, hasNumericScore } from "../../utils/format";
import { formatRoundKind } from "../../constants/rounds";
import { passesDecisionFilter } from "./decisionUtils";
import { getResumeReviewCount } from "../../utils/reviewCounts";
import { FRQ_METRIC, FRQ_MAX_SCORE } from "../../constants/frq";

export const defaultFilters = { major: "all", year: "all", reviews: "all", scoreBand: "all", decision: "all", signals: "all" };
export const SORT_TABS = [
  { id: "performance_desc", label: "Score · high to low" }, { id: "performance_asc", label: "Score · low to high" },
  { id: "referrals_desc", label: "Referrals · most" }, { id: "last_review_desc", label: "Last grade · newest" },
  { id: "last_review_asc", label: "Last grade · oldest" }, { id: "name_asc", label: "Name · A–Z" },
  { id: "name_desc", label: "Name · Z–A" }, { id: "reviews_desc", label: "Resume reviews · most" },
  { id: "reviews_asc", label: "Resume reviews · fewest" }, { id: "created_desc", label: "Applied · newest" },
  { id: "created_asc", label: "Applied · oldest" },
];

export function formatRoundBanner(round) { if (!round?.name) return "CANDIDATE SCORECARD"; const name = round.name.toUpperCase(); const kind = formatRoundKind(round.type).toUpperCase(); return name === kind ? name : `${name} · ${kind}`; }
export function formatRoundStatus(round) { return round?.status ? String(round.status).toUpperCase() : "VIEW"; }
export function scoreColor(score) { if (!hasNumericScore(score)) return css.textGray; return Number(score) >= 90 ? css.greenDark : Number(score) >= 80 ? "#4CAF50" : Number(score) >= 70 ? css.amber : css.textGray; }
export function getReviewerLabel(review, index) { return review?.reviewerName || review?.reviewerEmail || `Reviewer ${index + 1} not recorded`; }
export function getReviewerInitials(review, index) { return review?.reviewerName ? getInitials(review.reviewerName) : review?.reviewerEmail ? review.reviewerEmail.substring(0, 2).toUpperCase() : `R${index + 1}`; }
export function getReviewTotal(review) { return Number.isFinite(Number(review?.score)) ? Number(review.score) : Object.values(review?.scores ?? {}).reduce((total, value) => total + (Number(value) || 0), 0); }
export function uniqueSortedStrings(items) { return [...new Set((items || []).map((item) => String(item).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })); }

// The five academic-year values, in display order. Anything else sorts after these, alphabetically.
const YEAR_ORDER = ["freshman", "sophomore", "junior", "junior transfer", "senior"];
function yearRank(value) { const i = YEAR_ORDER.indexOf(value.toLowerCase()); return i === -1 ? YEAR_ORDER.length : i; }

// Like uniqueSortedStrings, but orders academic years by standing instead of alphabetically.
export function sortYears(items) {
  return [...new Set((items || []).map((item) => String(item).trim()).filter(Boolean))]
    .sort((a, b) => yearRank(a) - yearRank(b) || a.localeCompare(b, undefined, { sensitivity: "base" }));
}
export function countActiveFilters(filters) { return Object.keys(defaultFilters).filter((key) => filters[key] !== defaultFilters[key]).length; }
export function getNumReviews(candidate) { return getResumeReviewCount(candidate); }
export function getNormalizedScore(candidate) { return hasNumericScore(candidate?.normalizedScore) ? Number(candidate.normalizedScore) : null; }
export function getPerformanceSortScore(candidate) { return getNormalizedScore(candidate); }
export function getHeadlineScore(candidate) { const score = getNormalizedScore(candidate); return score == null ? null : Math.min(100, score); }
export function getSourceNormalizedScore(candidate) { return hasNumericScore(candidate?.sourceNormalizedScore) ? Number(candidate.sourceNormalizedScore) : getNormalizedScore(candidate); }
export function normalizeMetricScore(candidate, metric) { const value = candidate?.categoryScores?.[metric]; return hasNumericScore(value) ? Number(value) : null; }
export function getCandidateMetrics(candidate, fallbackMetrics = []) {
  const reviewMetrics = (candidate?.reviews || []).flatMap((review) => Object.keys(review?.scores || {}));
  const scoredCategoryMetrics = Object.entries(candidate?.categoryScores || {})
    .filter(([, value]) => hasNumericScore(value))
    .map(([metric]) => metric);
  const primaryMetrics = candidate?.metrics?.length
    ? candidate.metrics
    : reviewMetrics.length
      ? reviewMetrics
      : scoredCategoryMetrics.length
        ? scoredCategoryMetrics
        : fallbackMetrics;
  return [...new Set([
    ...primaryMetrics,
    ...scoredCategoryMetrics,
  ])];
}
export function getCandidateMetricMax(candidate, metric, fallbackMax = 4) {
  const explicit = Number(candidate?.categoryMaxScores?.[metric]);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  if (metric === FRQ_METRIC) return FRQ_MAX_SCORE;
  const review = (candidate?.reviews || []).find((item) => hasNumericScore(item?.scores?.[metric]));
  const reviewMax = Number(review?.maxPerCategory);
  return Number.isFinite(reviewMax) && reviewMax > 0 ? reviewMax : fallbackMax;
}

export function computeScoreCutoffs(candidates) {
  const scores = (candidates || []).map(getPerformanceSortScore).filter(hasNumericScore).map(Number).sort((a, b) => b - a);
  const at = (fraction) => scores.length ? scores[Math.max(1, Math.ceil(scores.length * fraction)) - 1] : null;
  return { top: at(0.2), strong: at(0.3) };
}

function matchesSearch(candidate, query) {
  const term = String(query || "").trim().toLowerCase();
  if (!term) return true;
  const fields = [candidate.name, candidate.email, candidate.major, candidate.year, candidate.phoneNumber]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  if (fields.some((value) => value.includes(term))) return true;
  // Phone fallback only: require enough digits to be meaningful, otherwise
  // letter-only queries (e.g. a name) would match every candidate.
  const digits = term.replace(/\D/g, "");
  if (digits.length < 3) return false;
  return String(candidate.phoneNumber || "").replace(/\D/g, "").includes(digits);
}

export function filterCandidates(candidates, filters, searchQuery, cutoffs) {
  return candidates.filter((candidate) => {
    const reviews = getNumReviews(candidate); const headline = getHeadlineScore(candidate); const ranking = getPerformanceSortScore(candidate);
    const scoreMatches = filters.scoreBand === "all" || (filters.scoreBand === "top" && cutoffs?.top != null && Number(ranking) >= cutoffs.top) || (filters.scoreBand === "strong" && cutoffs?.strong != null && Number(ranking) >= cutoffs.strong) || (filters.scoreBand === "low" && headline !== null && headline < 60 && reviews > 0) || (filters.scoreBand === "pending" && (reviews === 0 || headline === null));
    const reviewMatches = filters.reviews === "all" || filters.reviews === String(reviews) || (filters.reviews === "1+" && reviews >= 1) || (filters.reviews === "2+" && reviews >= 2);
    const signalMatches = filters.signals === "all" || (filters.signals === "referred" && candidate.referralCount > 0) || (filters.signals === "flagged" && candidate.flagCount > 0);
    return matchesSearch(candidate, searchQuery) && (filters.major === "all" || (candidate.major || "Undeclared") === filters.major) && (filters.year === "all" || String(candidate.year || "").trim() === filters.year) && reviewMatches && scoreMatches && signalMatches && passesDecisionFilter(candidate, filters.decision);
  });
}

const time = (value) => { const parsed = new Date(value || 0).getTime(); return Number.isFinite(parsed) ? parsed : null; };
const name = (a, b) => String(a?.name ?? "").localeCompare(String(b?.name ?? ""), undefined, { sensitivity: "base" });
const latestReview = (candidate) => {
  const values = (candidate?.reviews || []).map((review) => time(review.submittedAt)).filter((value) => value != null);
  return values.length ? Math.max(...values) : null;
};
const compareNullable = (a, b, descending, missingFirst = false) => {
  if (a == null && b == null) return 0;
  if (a == null) return missingFirst ? -1 : 1;
  if (b == null) return missingFirst ? 1 : -1;
  return descending ? b - a : a - b;
};
export function compareCandidates(a, b, sortBy) {
  let value = 0;
  if (sortBy === "performance_desc" || sortBy === "performance_asc") {
    const first = getPerformanceSortScore(a); const second = getPerformanceSortScore(b);
    value = first == null && second == null ? (time(a.createdAt) || 0) - (time(b.createdAt) || 0) : compareNullable(first, second, sortBy === "performance_desc");
  }
  else if (sortBy === "last_review_desc") value = compareNullable(latestReview(a), latestReview(b), true);
  else if (sortBy === "last_review_asc") value = compareNullable(latestReview(a), latestReview(b), false, true);
  else if (sortBy === "created_desc") value = compareNullable(time(a.createdAt), time(b.createdAt), true);
  else if (sortBy === "created_asc") value = compareNullable(time(a.createdAt), time(b.createdAt), false);
  else if (sortBy === "referrals_desc") value = (b.referralCount || 0) - (a.referralCount || 0);
  else if (sortBy === "reviews_desc") value = getNumReviews(b) - getNumReviews(a);
  else if (sortBy === "reviews_asc") value = getNumReviews(a) - getNumReviews(b);
  else if (sortBy === "name_desc") value = name(b, a);
  else if (sortBy === "name_asc") value = name(a, b);
  return value || (b.referralCount || 0) - (a.referralCount || 0) || name(a, b) || String(a?.id).localeCompare(String(b?.id));
}
