export const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

export const METRICS = ["experience", "leadership", "social impact", "communication"];
export const METRIC_ICONS = {
  "experience": "💼",
  "leadership": "👑",
  "social impact": "🤝",
  "communication": "🗣️",
  "work experience": "💼",
  "leadership experience": "👑",
  "leadership/work experience": "💼",
  "business or social impact": "🤝",
};
export const MAX_SCORE = METRICS.length * 6;
export const RUBRIC_MAX_PER_CATEGORY = 4;

const TWO_CATEGORY_METRICS = ["leadership/work experience", "business or social impact"];
const SOPHOMORE_METRICS = ["work experience", "leadership experience", "social impact"];

export const RUBRIC_CFG = {
  freshman: {
    image: "/rubrics/FreshmanRubric.png",
    label: "Freshman",
    metrics: TWO_CATEGORY_METRICS,
  },
  sophomore: {
    image: "/rubrics/SophomoreRubric.png",
    label: "Sophomore",
    metrics: SOPHOMORE_METRICS,
  },
  junior: {
    image: "/rubrics/OthersRubric.png",
    label: "Junior & Senior",
    metrics: TWO_CATEGORY_METRICS,
  },
  juniortransfer: {
    image: "/rubrics/OthersRubric.png",
    label: "Junior & Senior",
    metrics: TWO_CATEGORY_METRICS,
  },
  senior: {
    image: "/rubrics/OthersRubric.png",
    label: "Junior & Senior",
    metrics: TWO_CATEGORY_METRICS,
  },
};

export function normalizeYearKey(yearRaw) {
  if (yearRaw == null || yearRaw === "") return null;
  return String(yearRaw).toLowerCase().replace(/\s/g, "");
}

export function getRubricForYear(yearRaw) {
  const key = normalizeYearKey(yearRaw);
  return (key && RUBRIC_CFG[key]) || RUBRIC_CFG.sophomore;
}

export function getRubricMaxScore(rubric) {
  return rubric.metrics.length * RUBRIC_MAX_PER_CATEGORY;
}

export const YEAR_CFG = {
  freshman: {
    label: "freshman", icon: "🌱", sub: "1st Year",
    panelColor: "#5BA3E0", panelBg: "rgb(0, 104, 216)", panelBd: "rgba(91,163,224,0.30)",
    badgeBg: "rgba(74,144,217,0.13)", badgeColor: "#5BA3E0", badgeBd: "rgba(91,163,224,0.35)",
  },
  sophomore: {
    label: "sophomore", icon: "📚", sub: "2nd Year",
    panelColor: "#3DC9A0", panelBg: "rgb(0, 184, 126)", panelBd: "rgba(61,201,160,0.30)",
    badgeBg: "rgba(29,158,117,0.13)", badgeColor: "#3DC9A0", badgeBd: "rgba(61,201,160,0.35)",
  },
  junior: {
    label: "junior", icon: "⭐", sub: "3rd Year",
    panelColor: "#F5C060", panelBg: "rgb(206, 124, 0)", panelBd: "rgba(245,192,96,0.30)",
    badgeBg: "rgba(239,159,39,0.13)", badgeColor: "#F5C060", badgeBd: "rgba(245,192,96,0.35)",
  },
  juniortransfer: {
    label: "juniortransfer", icon: "⭐", sub: "3rd Year Transfer",
    panelColor: "#F5C060", panelBg: "rgb(206, 124, 0)", panelBd: "rgba(245,192,96,0.30)",
    badgeBg: "rgba(239,159,39,0.13)", badgeColor: "#F5C060", badgeBd: "rgba(245,192,96,0.35)",
  },
  senior: {
    label: "senior", icon: "⭐", sub: "4th Year",
    panelColor: "#F5C060", panelBg: "rgb(225, 0, 0)", panelBd: "rgba(245,192,96,0.30)",
    badgeBg: "rgba(239,159,39,0.13)", badgeColor: "#F5C060", badgeBd: "rgba(245,192,96,0.35)",
  },
};

export const BUBBLE_COLORS = {
  1: { bg: "rgba(226,75,74,0.1)",  bd: "#E24B4A", color: "#E24B4A"  },
  2: { bg: "rgba(226,75,74,0.05)", bd: "rgba(226,75,74,0.5)", color: "#E24B4A"  },
  3: { bg: "rgba(239,159,39,0.1)", bd: "#EF9F27", color: "#EF9F27"  },
  4: { bg: "rgba(239,159,39,0.05)",bd: "rgba(239,159,39,0.5)", color: "#EF9F27"  },
  5: { bg: "rgba(29,158,117,0.1)", bd: "#1D9E75", color: "#1D9E75"  },
  6: { bg: "rgba(29,158,117,0.2)", bd: "#1D9E75", color: "#1D9E75"  },
};

export const DEC_STYLE = {
  pass:   { bg: "rgba(29,158,117,0.12)", color: "#4ECBA0", bd: "rgba(29,158,117,0.28)", label: "✓ Completed" },
  flag:   { bg: "rgba(239,159,39,0.12)", color: "#F5C060", bd: "rgba(239,159,39,0.28)", label: "⚑ Flagged" },
  reject: { bg: "rgba(226,75,74,0.10)",  color: "#F07877", bd: "rgba(226,75,74,0.22)",  label: "✕ Skipped" },
};
