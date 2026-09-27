const VALID_ROLES = ['applicant', 'member', 'board', 'admin'];
const STAFF_ROLES = ['admin', 'member', 'board'];
const FRQ_GRADER_ROLES = ['admin', 'board'];

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function isStaffRole(role) {
  return STAFF_ROLES.includes(normalizeRole(role));
}

function canGradeFrq(role) {
  return FRQ_GRADER_ROLES.includes(normalizeRole(role));
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
  FRQ_GRADER_ROLES,
  normalizeRole,
  isStaffRole,
  canGradeFrq,
  getJwtSecret,
};
