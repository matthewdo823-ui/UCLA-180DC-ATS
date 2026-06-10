require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/authRoutes');
const resumeRoutes = require('./src/routes/resumeRoutes');
const cycleRoutes = require('./src/routes/cycleRoutes');
const { startFormsSyncCron } = require('./src/jobs/formsSyncCron');

const app = express();



app.use(express.json());
app.use(cors({
    origin(origin, callback) {
      const allowed = ['https://ucla-180-dc-ats.vercel.app'];
      if (!origin || allowed.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
  }));

// Mount routes
app.use('/auth', authRoutes);
app.use('/', cycleRoutes);
app.use('/', resumeRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startFormsSyncCron();
});
