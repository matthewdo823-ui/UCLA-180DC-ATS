const VALID_ROLES = ['applicant', 'member', 'admin'];
const STAFF_ROLES = ['admin', 'member'];

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function isStaffRole(role) {
  return STAFF_ROLES.includes(normalizeRole(role));
}

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  return secret;
}

module.exports = {
  VALID_ROLES,
  STAFF_ROLES,
  normalizeRole,
  isStaffRole,
  getJwtSecret,
};
