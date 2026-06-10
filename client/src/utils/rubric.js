import { RUBRIC_MAX_PER_CATEGORY } from "../constants/config";

export const RUBRIC_YEAR_KEYS = [
  { key: "freshman", title: "Freshman" },
  { key: "sophomore", title: "Sophomore" },
  { key: "junior", title: "Junior" },
  { key: "juniortransfer", title: "Junior Transfer" },
  { key: "senior", title: "Senior" },
];

export const RUBRIC_IMAGE_OPTIONS = [
  { value: "/rubrics/FreshmanRubric.png", label: "Freshman rubric image" },
  { value: "/rubrics/SophomoreRubric.png", label: "Sophomore rubric image" },
  { value: "/rubrics/OthersRubric.png", label: "Junior & Senior rubric image" },
];

export const DEFAULT_RUBRIC_CONFIG = {
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

export function cloneRubricConfig(config) {
  const base = config || DEFAULT_RUBRIC_CONFIG;
  return {
    maxPerCategory: base.maxPerCategory ?? RUBRIC_MAX_PER_CATEGORY,
    byYear: Object.fromEntries(
      RUBRIC_YEAR_KEYS.map(({ key }) => {
        const entry = base.byYear?.[key] || DEFAULT_RUBRIC_CONFIG.byYear[key];
        return [
          key,
          {
            label: entry?.label || DEFAULT_RUBRIC_CONFIG.byYear[key].label,
            imageUrl: entry?.imageUrl || DEFAULT_RUBRIC_CONFIG.byYear[key].imageUrl,
            metrics: [...(entry?.metrics || DEFAULT_RUBRIC_CONFIG.byYear[key].metrics)],
          },
        ];
      })
    ),
  };
}

export function validateRubricDraft(config) {
  if (!config || typeof config !== "object") return "Rubric config is required";
  const maxPerCategory = Number(config.maxPerCategory);
  if (!Number.isFinite(maxPerCategory) || maxPerCategory < 1 || maxPerCategory > 10) {
    return "Max per category must be between 1 and 10";
  }
  for (const { key, title } of RUBRIC_YEAR_KEYS) {
    const entry = config.byYear?.[key];
    if (!entry) return `Missing rubric for ${title}`;
    if (!String(entry.label || "").trim()) return `${title}: label is required`;
    if (!Array.isArray(entry.metrics) || !entry.metrics.length) {
      return `${title}: add at least one category`;
    }
    if (entry.metrics.some((m) => !String(m || "").trim())) {
      return `${title}: categories cannot be empty`;
    }
  }
  return null;
}

export function normalizeYearKey(yearRaw) {
  if (yearRaw == null || yearRaw === "") return null;
  return String(yearRaw).toLowerCase().replace(/\s/g, "");
}

export function getRubricForYear(rubricConfig, yearRaw) {
  const config = rubricConfig || {};
  const key = normalizeYearKey(yearRaw);
  const byYear = config.byYear || {};
  const fallback = byYear.sophomore || Object.values(byYear)[0] || {};
  const entry = key && byYear[key] ? byYear[key] : fallback;
  const maxPerCategory = config.maxPerCategory || RUBRIC_MAX_PER_CATEGORY;

  return {
    label: entry.label || "Rubric",
    imageUrl: entry.imageUrl || null,
    metrics: entry.metrics || [],
    maxPerCategory,
  };
}

export function getRubricMaxScore(rubric) {
  const maxPerCategory = rubric?.maxPerCategory || RUBRIC_MAX_PER_CATEGORY;
  const metrics = rubric?.metrics || [];
  return metrics.length * maxPerCategory;
}

export function rubricFromSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    label: snapshot.label || "Rubric",
    imageUrl: snapshot.imageUrl || null,
    metrics: snapshot.metrics || [],
    maxPerCategory: snapshot.maxPerCategory || RUBRIC_MAX_PER_CATEGORY,
    maxScore: snapshot.maxScore || null,
  };
}
