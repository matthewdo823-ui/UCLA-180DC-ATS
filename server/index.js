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
