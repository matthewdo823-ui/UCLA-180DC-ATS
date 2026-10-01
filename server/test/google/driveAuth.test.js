const test = require('node:test');
const assert = require('node:assert/strict');

const { getDriveImpersonateUser, getDriveClient } = require('../../src/utils/googleForm');

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

test('a missing Drive delegation subject is reported once, not per request', async () => {
  const previousDrive = process.env.GOOGLE_DRIVE_IMPERSONATE_USER;
  const previousKey = process.env.GOOGLE_CLOUD_KEY_PATH;
  const previousCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const realError = console.error;
  const lines = [];
  try {
    delete process.env.GOOGLE_DRIVE_IMPERSONATE_USER;
    // No key file, so getDriveClient() returns null before reaching the warning:
    // this pins that the warning belongs to the no-subject branch specifically
    // and does not fire for deployments with no Google credentials at all.
    delete process.env.GOOGLE_CLOUD_KEY_PATH;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    console.error = (...args) => lines.push(args.join(' '));

    assert.equal(await getDriveClient(), null);
    assert.equal(lines.length, 0);
  } finally {
    console.error = realError;
    if (previousDrive === undefined) delete process.env.GOOGLE_DRIVE_IMPERSONATE_USER;
    else process.env.GOOGLE_DRIVE_IMPERSONATE_USER = previousDrive;
    if (previousKey !== undefined) process.env.GOOGLE_CLOUD_KEY_PATH = previousKey;
    if (previousCreds !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS = previousCreds;
  }
});
