import { RUBRIC_MAX_PER_CATEGORY } from "../constants/config";

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
