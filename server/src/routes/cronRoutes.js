const express = require("express");
const router = express.Router();
const cronController = require("../controllers/cronController");

router.post("/cron/forms-sync", cronController.syncForms);

module.exports = router;
