require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./src/routes/authRoutes');

const app = express();

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));

function parseAllowedOrigins() {
  const raw = process.env.CORS_ALLOWED_ORIGINS || '';
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

function isLocalDevelopmentOrigin(origin) {
  return /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(origin);
}

app.use(express.json());
app.use(cors({
  origin(origin, callback) {
    const allowed = parseAllowedOrigins();
    if (!origin || allowed.includes(origin) || isLocalDevelopmentOrigin(origin)) {
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

// Gmail OAuth setup redirect (no auth — used only during npm run gmail-oauth-setup)
app.get('/oauth2callback', (req, res) => {
  const code = String(req.query?.code || '').trim();
  const err = String(req.query?.error || '').trim();
  if (err) {
    return res.status(400).type('html').send(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem">`
      + `<h2>Google sign-in failed</h2><p>${err}</p><p>Close this tab and try again.</p></body></html>`
    );
  }
  if (!code) {
    return res.status(400).type('html').send(
      '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem">'
      + '<h2>No authorization code</h2><p>Close this tab and run npm run gmail-oauth-setup again.</p></body></html>'
    );
  }
  const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    const { startFormsSyncCron } = require('./src/jobs/formsSyncCron');

    app.use(cronRoutes);
    app.use('/', cycleRoutes);
    app.use('/', interviewRoutes);
    app.use('/', resumeRoutes);
    app.use('/', dashboardRoutes);
    app.use('/', userRoutes);

    console.log('API routes loaded');
    startFormsSyncCron();
});
