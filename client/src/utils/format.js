export function hasNumericScore(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

export function getInitials(name) {
  if (!name) return "??";
  return name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
}

export function titleCase(value) {
  if (!value) return "";
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

export function formatScore(value, { fallback = "N/A" } = {}) {
  if (!hasNumericScore(value)) return fallback;
  const numeric = Number(value);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

export function formatNumber(value, options = {}) {
  return formatScore(value, options);
}

export function formatPoints(score, maxScore, { fallback = "—", suffix = false } = {}) {
  if (!hasNumericScore(score) || !hasNumericScore(maxScore)) return fallback;
  const label = `${formatScore(score)} / ${formatScore(maxScore)}`;
  return suffix ? `${label} pts` : label;
}

export function formatDate(value, { fallback = "—", style = "locale" } = {}) {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  if (style === "short") {
    return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  }
  if (style === "datetime") {
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (style === "compact") {
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString();
}

export function displayName(user) {
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ");
  return name || user?.email || "";
}
