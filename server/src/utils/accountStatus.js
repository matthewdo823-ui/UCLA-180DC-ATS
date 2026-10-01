const ACCOUNT_STATUSES = {
  PENDING: 'pending',
  ACTIVE: 'active',
  DEACTIVATED: 'deactivated',
};

function normalizeAccountStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function isActiveAccount(user) {
  return normalizeAccountStatus(user?.account_status) === ACCOUNT_STATUSES.ACTIVE;
}

module.exports = {
  ACCOUNT_STATUSES,
  normalizeAccountStatus,
  isActiveAccount,
};
