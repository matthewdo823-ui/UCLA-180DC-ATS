require('dotenv').config();
const express = require('express');
const cors = require('cors');

const resumeRoutes = require('./src/routes/resumeRoutes');
const { startFormsSyncCron } = require('./src/jobs/formsSyncCron');

const app = express();

app.use(express.json());
app.use(cors());

// Mount routes
app.use('/', resumeRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    startFormsSyncCron();
});
