const RUBRIC_MAX_PER_CATEGORY = 4;

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

module.exports = {
  RUBRIC_MAX_PER_CATEGORY,
  DEFAULT_RUBRIC_CONFIG,
  normalizeYearKey,
  getRubricForYear,
  getRubricMaxScore,
  validateRubricConfig,
};
