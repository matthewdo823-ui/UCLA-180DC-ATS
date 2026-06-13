#!/usr/bin/env node
/**
 * Send a single test email via configured Gmail credentials.
 *
 * Usage (from server/):
 *   npm run gmail-test-send
 *   npm run gmail-test-send -- you@example.com
 */
require("dotenv").config();
const { isGmailConfigured, sendPlainTextEmail, getFromAddress } = require("../src/services/emailService");

async function main() {
  const to = process.argv[2] || process.env.GMAIL_SEND_AS || process.env.GMAIL_IMPERSONATE_USER;
  if (!to) {
    console.error("Pass a recipient email or set GMAIL_SEND_AS in .env");
    process.exit(1);
  }

  if (!isGmailConfigured()) {
    console.error("Gmail is not configured. See server/docs/gmail-setup.md");
    process.exit(1);
  }

  console.log(`From: ${getFromAddress()}`);
  console.log(`To:   ${to}`);

  await sendPlainTextEmail({
    to,
    subject: "[ATS] Gmail test",
    body: [
      "This is a test email from the Resume Screener API.",
      "",
      "If you received this, Gmail sending is configured correctly.",
    ].join("\n"),
  });

  console.log("Sent successfully.");
}

main().catch((err) => {
  console.error("Send failed:", err.message || err);
  process.exit(1);
});
