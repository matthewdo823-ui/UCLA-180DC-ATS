export function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function displayValue(value, fallback = "Not provided") {
  return hasText(value) ? value.trim() : fallback;
}

export function linkedinHref(linkedin) {
  if (!hasText(linkedin)) return undefined;
  return !/^https?:\/\//i.test(linkedin) ? `https://${linkedin.trim()}` : linkedin.trim();
}
