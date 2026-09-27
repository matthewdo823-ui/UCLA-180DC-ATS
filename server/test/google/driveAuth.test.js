const test = require('node:test');
const assert = require('node:assert/strict');

const { getDriveImpersonateUser } = require('../../src/utils/googleForm');

test('Gmail delegation never changes the Drive identity', () => {
  const previousDrive = process.env.GOOGLE_DRIVE_IMPERSONATE_USER;
  const previousGmail = process.env.GMAIL_IMPERSONATE_USER;
  try {
    delete process.env.GOOGLE_DRIVE_IMPERSONATE_USER;
    process.env.GMAIL_IMPERSONATE_USER = 'gmail-only@example.com';
    assert.equal(getDriveImpersonateUser(), '');

    process.env.GOOGLE_DRIVE_IMPERSONATE_USER = 'forms-owner@example.com';
    assert.equal(getDriveImpersonateUser(), 'forms-owner@example.com');
  } finally {
    if (previousDrive === undefined) delete process.env.GOOGLE_DRIVE_IMPERSONATE_USER;
    else process.env.GOOGLE_DRIVE_IMPERSONATE_USER = previousDrive;
    if (previousGmail === undefined) delete process.env.GMAIL_IMPERSONATE_USER;
    else process.env.GMAIL_IMPERSONATE_USER = previousGmail;
  }
});
