const RUBRIC_MAX_PER_CATEGORY = 4;

/** Pre-2026 rubric: four categories scored 1–6 (max 24). */
const LEGACY_RUBRIC_METRICS = [
  "experience",
  "leadership",
  "communication",
  "social impact",
];
const LEGACY_RUBRIC_MAX_PER_CATEGORY = 6;
const LEGACY_RUBRIC_MAX_SCORE = LEGACY_RUBRIC_METRICS.length * LEGACY_RUBRIC_MAX_PER_CATEGORY;

const DEFAULT_RUBRIC_CONFIG = {
  maxPerCategory: RUBRIC_MAX_PER_CATEGORY,
  byYear: {
    freshman: {
      label: "Freshman",
      imageUrl: "/rubrics/FreshmanRubric.png",
      metrics: ["leadership/work experience", "business or social impact"],
    },
    sophomore: {
      label: "Sophomore",
      imageUrl: "/rubrics/SophomoreRubric.png",
      metrics: ["work experience", "leadership experience", "social impact"],
    },
    junior: {
      label: "Junior & Senior",
      imageUrl: "/rubrics/OthersRubric.png",
      metrics: ["leadership/work experience", "business or social impact"],
    },
    juniortransfer: {
      label: "Junior & Senior",
      imageUrl: "/rubrics/OthersRubric.png",
      metrics: ["leadership/work experience", "business or social impact"],
    },
    senior: {
      label: "Junior & Senior",
      imageUrl: "/rubrics/OthersRubric.png",
      metrics: ["leadership/work experience", "business or social impact"],
    },
  },
};

function normalizeYearKey(yearRaw) {
  if (yearRaw == null || yearRaw === "") return null;
  return String(yearRaw).toLowerCase().replace(/\s/g, "");
}

function getRubricForYear(rubricConfig, yearRaw) {
  const config = rubricConfig || DEFAULT_RUBRIC_CONFIG;
  const key = normalizeYearKey(yearRaw);
  const byYear = config.byYear || {};
  const fallback = byYear.sophomore || Object.values(byYear)[0];
  if (!key || !byYear[key]) {
    return {
      label: fallback?.label || "Sophomore",
      imageUrl: fallback?.imageUrl || null,
      metrics: fallback?.metrics || [],
      maxPerCategory: config.maxPerCategory || RUBRIC_MAX_PER_CATEGORY,
    };
  }
  const entry = byYear[key];
  return {
    label: entry.label,
    imageUrl: entry.imageUrl,
    metrics: entry.metrics,
    maxPerCategory: config.maxPerCategory || RUBRIC_MAX_PER_CATEGORY,
  };
}

function getRubricMaxScore(rubric) {
  const maxPerCategory = rubric?.maxPerCategory || RUBRIC_MAX_PER_CATEGORY;
  const metrics = rubric?.metrics || [];
  return metrics.length * maxPerCategory;
}

function validateRubricConfig(config) {
  if (!config || typeof config !== "object") {
    return "rubric_config must be an object";
  }
  const maxPerCategory = Number(config.maxPerCategory);
  if (!Number.isFinite(maxPerCategory) || maxPerCategory < 1 || maxPerCategory > 10) {
    return "maxPerCategory must be a number between 1 and 10";
  }
  if (!config.byYear || typeof config.byYear !== "object" || !Object.keys(config.byYear).length) {
    return "byYear must be a non-empty object";
  }
  for (const [yearKey, entry] of Object.entries(config.byYear)) {
    if (!entry || typeof entry !== "object") {
      return `byYear.${yearKey} must be an object`;
    }
    if (!Array.isArray(entry.metrics) || !entry.metrics.length) {
      return `byYear.${yearKey}.metrics must be a non-empty array`;
    }
    if (entry.metrics.some((m) => typeof m !== "string" || !m.trim())) {
      return `byYear.${yearKey}.metrics must contain non-empty strings`;
    }
  }
  return null;
}

function validateScreeningScores(scores, rubricForYear) {
  if (!scores || typeof scores !== "object") {
    return "scores must be an object";
  }
  if (!rubricForYear || !Array.isArray(rubricForYear.metrics) || !rubricForYear.metrics.length) {
    return "rubric is not configured for this candidate year";
  }

  const max = rubricForYear.maxPerCategory || RUBRIC_MAX_PER_CATEGORY;
  for (const metric of rubricForYear.metrics) {
    const value = Number(scores[metric]);
    if (!Number.isFinite(value) || value < 0 || value > max) {
      return `Each category must be scored 0–${max} (${metric})`;
    }
  }
  return null;
}

function normalizeScreeningScoresInput(scores, rubricForYear) {
  const err = validateScreeningScores(scores, rubricForYear);
  if (err) return { error: err };

  const out = {};
  for (const metric of rubricForYear.metrics) {
    out[metric] = Math.round(Number(scores[metric]));
  }
  return { scores: out };
}

function buildRubricSnapshot(rubricConfig, yearRaw) {
  const rubricForYear = getRubricForYear(rubricConfig, yearRaw);
  return {
    yearKey: normalizeYearKey(yearRaw),
    label: rubricForYear.label,
    metrics: rubricForYear.metrics,
    maxPerCategory: rubricForYear.maxPerCategory,
    maxScore: getRubricMaxScore(rubricForYear),
    imageUrl: rubricForYear.imageUrl,
  };
}

function isLegacyReviewScores(scores = {}) {
  const keys = Object.keys(scores || {});
  return keys.some((key) => LEGACY_RUBRIC_METRICS.includes(key));
}

function buildLegacyRubricSnapshot() {
  return {
    legacy: true,
    label: "Legacy",
    metrics: LEGACY_RUBRIC_METRICS,
    maxPerCategory: LEGACY_RUBRIC_MAX_PER_CATEGORY,
    maxScore: LEGACY_RUBRIC_MAX_SCORE,
  };
}

/**
 * Resolve which metrics and max score apply to a stored review.
 * Legacy reviews (no snapshot, old metric names) use the 24-point scale.
 */
function resolveReviewScoringContext(review, options = {}) {
  const scores = review?.scores || {};
  const snapshot = review?.rubric_snapshot || review?.rubricSnapshot || null;

  if (snapshot?.metrics?.length) {
    const maxPerCategory = snapshot.maxPerCategory || RUBRIC_MAX_PER_CATEGORY;
    return {
      metrics: snapshot.metrics,
      maxScore: Number.isFinite(Number(snapshot.maxScore)) && snapshot.maxScore > 0
        ? Number(snapshot.maxScore)
        : getRubricMaxScore({ metrics: snapshot.metrics, maxPerCategory }),
      maxPerCategory,
      legacy: !!snapshot.legacy,
      snapshot,
    };
  }

  if (isLegacyReviewScores(scores)) {
    const legacySnapshot = buildLegacyRubricSnapshot();
    const metrics = LEGACY_RUBRIC_METRICS.filter((metric) => scores[metric] != null);
    return {
      metrics: metrics.length ? metrics : LEGACY_RUBRIC_METRICS,
      maxScore: LEGACY_RUBRIC_MAX_SCORE,
      maxPerCategory: LEGACY_RUBRIC_MAX_PER_CATEGORY,
      legacy: true,
      snapshot: legacySnapshot,
    };
  }

  const { rubricConfig, candidateYear } = options;
  if (rubricConfig) {
    const rubricForYear = getRubricForYear(rubricConfig, candidateYear);
    return {
      metrics: rubricForYear.metrics,
      maxScore: getRubricMaxScore(rubricForYear),
      maxPerCategory: rubricForYear.maxPerCategory,
      legacy: false,
      snapshot: buildRubricSnapshot(rubricConfig, candidateYear),
    };
  }

  const metrics = Object.keys(scores);
  return {
    metrics,
    maxScore: metrics.length ? metrics.length * RUBRIC_MAX_PER_CATEGORY : null,
    maxPerCategory: RUBRIC_MAX_PER_CATEGORY,
    legacy: false,
    snapshot: null,
  };
}

function resolveCandidateResumeMax(reviews = [], options = {}) {
  if (!reviews?.length) {
    if (options.rubricConfig) {
      return getRubricMaxScore(getRubricForYear(options.rubricConfig, options.candidateYear));
    }
    return null;
  }

  const maxScores = reviews
    .map((review) => {
      if (Number.isFinite(Number(review?.maxScore)) && review.maxScore > 0) {
        return Number(review.maxScore);
      }
      return resolveReviewScoringContext(review, options).maxScore;
    })
    .filter((value) => Number.isFinite(value) && value > 0);

  const unique = [...new Set(maxScores)];
  if (unique.length === 1) return unique[0];

  if (options.rubricConfig) {
    return getRubricMaxScore(getRubricForYear(options.rubricConfig, options.candidateYear));
  }

  return maxScores[0] ?? null;
}

function getReviewScoring(review, options = {}) {
  const context = resolveReviewScoringContext(review, options);
  const score = computeRawScore(review?.scores || {}, context.metrics);
  const normalizedScore = computeNormalizedFromAggregate(score, context.maxScore);
  return {
    ...context,
    score,
    normalizedScore,
  };
}

function computeRawScore(scores = {}, metrics = []) {
  if (metrics.length) {
    return metrics.reduce((sum, metric) => sum + (Number(scores[metric]) || 0), 0);
  }
  return Object.values(scores).reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function computeNormalizedScore(scores, snapshot) {
  const maxScore = Number(snapshot?.maxScore);
  if (!Number.isFinite(maxScore) || maxScore <= 0) return null;
  const metrics = snapshot?.metrics || Object.keys(scores || {});
  const raw = computeRawScore(scores, metrics);
  return Number(Math.min(100, (raw / maxScore) * 100).toFixed(2));
}

function getMetricsFromRubricConfig(rubricConfig) {
  const byYear = rubricConfig?.byYear || {};
  const metrics = new Set();
  Object.values(byYear).forEach((entry) => {
    (entry?.metrics || []).forEach((metric) => metrics.add(metric));
  });
  return [...metrics];
}

function getLegacyNormalizedScore(scores) {
  const raw = computeRawScore(scores);
  return Number(Math.min(100, (raw / 24) * 100).toFixed(2));
}

/** Cosmetic % derived from raw rubric scores — never treat as source of truth. */
function computeNormalizedFromAggregate(aggregateScore, maxScore) {
  const raw = Number(aggregateScore);
  const max = Number(maxScore);
  if (!Number.isFinite(raw) || !Number.isFinite(max) || max <= 0) return null;
  return Number(Math.min(100, (raw / max) * 100).toFixed(1));
}

function computeReviewNormalizedFromScores(review, options = {}) {
  const scores = review?.scores || {};
  if (!Object.keys(scores).length) return null;

  const context = resolveReviewScoringContext(review, options);
  const raw = computeRawScore(scores, context.metrics);
  return computeNormalizedFromAggregate(raw, context.maxScore);
}

/**
 * Resolve a review's display % from raw scores when available.
 * Stored normalized_score is only used as a fallback when scores are missing.
 */
function resolveReviewNormalizedValue(review, options = {}) {
  const fromScores = computeReviewNormalizedFromScores(review, options);
  if (fromScores != null) return fromScores;

  if (Number.isFinite(Number(review?.normalized_score))) {
    return Number(review.normalized_score);
  }

  return null;
}

module.exports = {
  RUBRIC_MAX_PER_CATEGORY,
  LEGACY_RUBRIC_METRICS,
  LEGACY_RUBRIC_MAX_PER_CATEGORY,
  LEGACY_RUBRIC_MAX_SCORE,
  DEFAULT_RUBRIC_CONFIG,
  normalizeYearKey,
  getRubricForYear,
  getRubricMaxScore,
  validateRubricConfig,
  validateScreeningScores,
  normalizeScreeningScoresInput,
  buildRubricSnapshot,
  isLegacyReviewScores,
  buildLegacyRubricSnapshot,
  resolveReviewScoringContext,
  resolveCandidateResumeMax,
  getReviewScoring,
  computeRawScore,
  computeNormalizedScore,
  getMetricsFromRubricConfig,
  getLegacyNormalizedScore,
  computeNormalizedFromAggregate,
  computeReviewNormalizedFromScores,
  resolveReviewNormalizedValue,
};
