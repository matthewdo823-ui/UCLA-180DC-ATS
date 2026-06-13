require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/authRoutes');
const resumeRoutes = require('./src/routes/resumeRoutes');
const cycleRoutes = require('./src/routes/cycleRoutes');
const interviewRoutes = require('./src/routes/interviewRoutes');
const userRoutes = require('./src/routes/userRoutes');
const cronRoutes = require('./src/routes/cronRoutes');
const { startFormsSyncCron } = require('./src/jobs/formsSyncCron');

const app = express();

app.set('trust proxy', 1);

function parseAllowedOrigins() {
  const raw = process.env.CORS_ALLOWED_ORIGINS || '';
  return raw.split(',').map((origin) => origin.trim()).filter(Boolean);
}

app.use(express.json());
app.use(cors({
    origin(origin, callback) {
      const allowed = parseAllowedOrigins();
      if (!origin || allowed.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  }));

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

// Mount routes
app.use(cronRoutes);
app.use('/auth', authRoutes);
app.use('/', cycleRoutes);
app.use('/', interviewRoutes);
app.use('/', resumeRoutes);
app.use('/', userRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startFormsSyncCron();
});
