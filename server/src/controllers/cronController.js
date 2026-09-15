const { syncFormResponsesToDatabase, isSyncConfigured } = require("../services/formsSyncService");
const { syncAllInterestEvents } = require("../services/interestSyncService");
const { respondWithServerError } = require("../utils/httpErrors");

function verifyCronSecret(req, res) {
  const expected = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || "";

  if (!expected || authHeader !== `Bearer ${expected}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }

  return true;
}

exports.syncForms = async (req, res) => {
  if (!verifyCronSecret(req, res)) return;

  if (!isSyncConfigured()) {
    return res.status(503).json({
      error:
        "Google Forms sync is not configured. Set GOOGLE_CLOUD_KEY_PATH (or GOOGLE_APPLICATION_CREDENTIALS) and configure a Google Form on at least one cycle.",
    });
  }

  try {
    const result = await syncFormResponsesToDatabase();
    // After the application sync, so attendance can match candidates created in the same run.
    let interest;
    try {
      interest = await syncAllInterestEvents();
    } catch (err) {
      console.error("[cron] Demonstrated Interest sync failed:", err.message || err);
      interest = { error: "Demonstrated Interest sync failed" };
    }
    return res.json({
      processed: result.processed,
      errors: result.errors,
      cycles: result.cycles,
      interest,
    });
  } catch (err) {
    return respondWithServerError(res, err, "syncForms", "Form sync failed");
  }
};
