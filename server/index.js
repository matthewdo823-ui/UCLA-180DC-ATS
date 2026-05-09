require('dotenv').config();
const express = require('express');
const cors = require('cors');

const resumeRoutes = require('./src/routes/resumeRoutes');

const app = express();

app.use(express.json());
app.use(cors({ origin: 'http://localhost:5173' }));

// Mount routes
app.use('/', resumeRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
