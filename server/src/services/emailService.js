const fs = require("fs");
const { OAuth2Client, JWT } = require("google-auth-library");
const { gmail } = require("@googleapis/gmail");

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

function getKeyFilePath() {
  return process.env.GOOGLE_CLOUD_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
}

function getFromAddress() {
  const name = String(process.env.GMAIL_FROM_NAME || "180DC Recruiting").trim();
  const email = String(
    process.env.GMAIL_IMPERSONATE_USER || process.env.GMAIL_SEND_AS || ""
  ).trim();
  if (!email) return null;
  return name ? `${name} <${email}>` : email;
}

function isGmailConfigured() {
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (refreshToken && clientId && clientSecret) return true;

  const impersonate = process.env.GMAIL_IMPERSONATE_USER;
  const keyFile = getKeyFilePath();
  return Boolean(impersonate && keyFile && fs.existsSync(keyFile));
}

async function getGmailClient() {
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (refreshToken && clientId && clientSecret) {
    const oauth2 = new OAuth2Client(
      clientId,
      clientSecret,
      process.env.GMAIL_OAUTH_REDIRECT_URI || "http://localhost:3000/oauth2callback"
    );
    oauth2.setCredentials({ refresh_token: refreshToken });
    return gmail({ version: "v1", auth: oauth2 });
  }

  const impersonate = process.env.GMAIL_IMPERSONATE_USER;
  const keyFile = getKeyFilePath();
  if (impersonate && keyFile) {
    if (!fs.existsSync(keyFile)) {
      throw new Error(`Google key file not found: ${keyFile}`);
    }
    const auth = new JWT({
      keyFile,
      scopes: [GMAIL_SEND_SCOPE],
      subject: impersonate,
    });
    return gmail({ version: "v1", auth });
  }

  throw new Error(
    "Gmail is not configured. For personal Gmail (@gmail.com), set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN (run npm run gmail-oauth-setup). For Google Workspace, set GOOGLE_CLOUD_KEY_PATH and GMAIL_IMPERSONATE_USER with domain-wide delegation."
  );
}

function encodeEmailRaw({ from, to, subject, body }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ];
  const message = lines.join("\r\n");
  return Buffer.from(message, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sendPlainTextEmail({ to, subject, body }) {
  const from = getFromAddress();
  if (!from) {
    throw new Error("Set GMAIL_IMPERSONATE_USER or GMAIL_SEND_AS to the sender email address.");
  }
  if (!to || !subject || !body) {
    throw new Error("to, subject, and body are required");
  }

  const gmail = await getGmailClient();
  const raw = encodeEmailRaw({ from, to, subject, body });

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return { to, subject };
}

module.exports = {
  isGmailConfigured,
  getFromAddress,
  sendPlainTextEmail,
};
