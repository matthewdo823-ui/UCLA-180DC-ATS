const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ACCOUNT_STATUSES,
  normalizeAccountStatus,
  isActiveAccount,
} = require('../../src/utils/accountStatus');

test('account status normalization is case and whitespace insensitive', () => {
  assert.equal(normalizeAccountStatus(' Active '), ACCOUNT_STATUSES.ACTIVE);
  assert.equal(normalizeAccountStatus(null), '');
});

test('only active accounts pass authentication status checks', () => {
  assert.equal(isActiveAccount({ account_status: 'active' }), true);
  assert.equal(isActiveAccount({ account_status: 'pending' }), false);
  assert.equal(isActiveAccount({ account_status: 'deactivated' }), false);
  assert.equal(isActiveAccount(null), false);
});
