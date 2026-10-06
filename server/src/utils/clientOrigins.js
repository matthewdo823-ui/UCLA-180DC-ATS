function parseAllowedOrigins() {
  const raw = process.env.CORS_ALLOWED_ORIGINS || '';
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

function isLocalDevelopmentOrigin(origin) {
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(origin);
}

function isAllowedClientOrigin(origin) {
  return Boolean(origin) && (parseAllowedOrigins().includes(origin) || isLocalDevelopmentOrigin(origin));
}

const RESET_PATH = '/reset-password';

/**
 * Where a password-reset email should send the user. An explicit
 * PASSWORD_RESET_URL wins; otherwise the link goes back to the frontend that
 * asked for it (only if CORS already trusts that origin), then CLIENT_URL. A
 * bare origin gets the reset route appended — a link to the site root drops
 * the token on a page that never reads it.
 */
function resolvePasswordResetUrl(token, requestOrigin) {
  const explicit = String(process.env.PASSWORD_RESET_URL || '').trim();
  const fallback = String(process.env.CLIENT_URL || '').trim();
  const base = explicit
    || (isAllowedClientOrigin(requestOrigin) ? requestOrigin : '')
    || fallback
    || `http://localhost:5173${RESET_PATH}`;

  const url = new URL(base);
  if (url.pathname === '' || url.pathname === '/') url.pathname = RESET_PATH;
  url.searchParams.set('token', token);
  return url.toString();
}

module.exports = {
  parseAllowedOrigins,
  isLocalDevelopmentOrigin,
  isAllowedClientOrigin,
  resolvePasswordResetUrl,
};
