export function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

export function isStaffRole(role) {
  const normalized = normalizeRole(role);
  return normalized === "admin" || normalized === "member";
}

export function isAdminRole(role) {
  return normalizeRole(role) === "admin";
}
