#!/usr/bin/env node
/**
 * One-time OAuth setup for personal Gmail (@gmail.com).
 *
 * Prerequisites:
 *   1. Gmail API enabled in GCP
 *   2. OAuth 2.0 Client ID (Desktop or Web) with redirect URI below
 *   3. GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in server/.env
 *
 * Usage (from server/):
 *   npm run gmail-oauth-setup
 */
require("dotenv").config();
const readline = require("readline");
const { google } = require("googleapis");

const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];
const REDIRECT_URI =
  process.env.GMAIL_OAUTH_REDIRECT_URI || "http://localhost:3000/oauth2callback";

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in server/.env first.");
    console.error("Create an OAuth client at: GCP Console → APIs & Services → Credentials");
    process.exit(1);
  }

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });

  console.log("\n1. Open this URL in a browser (log in as the sender account):\n");
  console.log(url);
  console.log("\n2. After approving, copy the ?code=... value from the redirect URL.\n");

  const code = await ask("Paste authorization code: ");
  if (!code) {
    console.error("No code provided.");
    process.exit(1);
  }

  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    console.error(
      "No refresh token returned. Revoke app access at https://myaccount.google.com/permissions and run again with prompt=consent."
    );
    process.exit(1);
  }

  const sendAs = process.env.GMAIL_SEND_AS || process.env.GMAIL_IMPERSONATE_USER || "matthewdo823@gmail.com";

  console.log("\nAdd these lines to server/.env:\n");
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log(`GMAIL_SEND_AS=${sendAs}`);
  console.log(`GMAIL_FROM_NAME=180DC Recruiting`);
  console.log("\nThen restart the API and run: npm run gmail-test-send\n");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
