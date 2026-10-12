require('dotenv').config();
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./src/routes/authRoutes');
const { isAllowedClientOrigin } = require('./src/utils/clientOrigins');

const app = express();

// gzip every response large enough to be worth it. The scoreboard payload is
// repetitive JSON (field names, per-candidate rubric arrays) that compresses
// ~80-90%, which is also the cheapest lever on Render's outbound-byte billing.
// Registered before helmet/cors/routes so it wraps every response, including the
// routes mounted later inside app.listen.
function compressionOptions() {
  return {
    // Responses under ~1 KB (e.g. /health) cost more CPU to compress than they
    // save, so skip them. This matches the library default; stated explicitly.
    threshold: 1024,
    filter(req, res) {
      // Explicit per-request opt-out, handy for debugging raw payload sizes.
      if (req.headers['x-no-compression']) return false;
      // Otherwise defer to the built-in content-type heuristic, which already
      // compresses application/json and skips already-compressed bodies.
      return compression.filter(req, res);
    },
  };
}

app.set('trust proxy', 1);
app.use(compression(compressionOptions()));
app.use(helmet({ contentSecurityPolicy: false }));

// This process serves authenticated recruiting data, not public cacheable API
// resources. Later file-stream handlers may deliberately replace this with a
// bounded private cache header after authorizing a specific document.
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Pragma', 'no-cache');
  res.vary('Authorization');
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || isAllowedClientOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));

// Liveness probe — intentionally cheap: no auth, no DB. Mounted synchronously
// (not inside app.listen's callback) so an external keep-alive pinger can hit it
// the instant the process boots. Used to stop Render's free tier from spinning down.
app.get('/health', (_req, res) => res.status(200).json({ ok: true, ts: Date.now() }));

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Gmail OAuth setup redirect. Keep this one-time utility closed unless a
// maintainer explicitly enables it while obtaining a refresh token; leaving it
// online serves no production purpose and OAuth codes can appear in request URLs.
app.get('/oauth2callback', (req, res) => {
  if (process.env.GMAIL_OAUTH_SETUP_ENABLED !== '1') {
    return res.status(404).json({ error: 'Not found' });
  }

  const code = String(req.query?.code || '').trim();
  const err = String(req.query?.error || '').trim();
  if (err) {
    return res.status(400).type('html').send(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem">`
      + `<h2>Google sign-in failed</h2><p>${escapeHtml(err)}</p><p>Close this tab and try again.</p></body></html>`
    );
  }
  if (!code) {
    return res.status(400).type('html').send(
      '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem">'
      + '<h2>No authorization code</h2><p>Close this tab and run npm run gmail-oauth-setup again.</p></body></html>'
    );
  }
  const escaped = escapeHtml(code);
  return res.type('html').send(
    '<!DOCTYPE html><html><head><title>Gmail OAuth</title></head>'
    + '<body style="font-family:sans-serif;max-width:640px;margin:2rem auto;padding:0 1rem">'
    + '<h2>Authorization successful</h2>'
    + '<p>Copy this code and paste it into the terminal running <code>npm run gmail-oauth-setup</code>:</p>'
    + `<textarea readonly style="width:100%;height:5rem;font-family:monospace;padding:0.5rem">${escaped}</textarea>`
    + '<p style="color:#666;font-size:0.9rem">You can close this tab after pasting the code.</p>'
    + '</body></html>'
  );
});

// Auth first so login works while heavier routes load in the background.
app.use('/auth', authRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    const cronRoutes = require('./src/routes/cronRoutes');
    const cycleRoutes = require('./src/routes/cycleRoutes');
    const interviewRoutes = require('./src/routes/interviewRoutes');
    const resumeRoutes = require('./src/routes/resumeRoutes');
    const dashboardRoutes = require('./src/routes/dashboardRoutes');
    const userRoutes = require('./src/routes/userRoutes');
    const interestRoutes = require('./src/routes/interestRoutes');
    const { startFormsSyncCron } = require('./src/jobs/formsSyncCron');

    app.use(cronRoutes);
    app.use('/', cycleRoutes);
    app.use('/', interviewRoutes);
    app.use('/', resumeRoutes);
    app.use('/', dashboardRoutes);
    app.use('/', userRoutes);
    app.use('/', interestRoutes);

    console.log('API routes loaded');
    startFormsSyncCron();
});
