export function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

export function isStaffRole(role) {
  const normalized = normalizeRole(role);
  return normalized === "admin" || normalized === "member" || normalized === "board";
}

export function isAdminRole(role) {
  return normalizeRole(role) === "admin";
}

export function isBoardRole(role) {
  return normalizeRole(role) === "board";
}

export function canGradeFrq(role) {
  const normalized = normalizeRole(role);
  return normalized === "admin" || normalized === "board";
}
