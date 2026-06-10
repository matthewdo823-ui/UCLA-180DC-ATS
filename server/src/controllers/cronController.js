const { syncFormResponsesToDatabase, isSyncConfigured } = require("../services/formsSyncService");

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
    return res.json({
      processed: result.processed,
      errors: result.errors,
      cycles: result.cycles,
    });
  } catch (err) {
    console.error("[formsSync] Cron sync failed:", err);
    return res.status(500).json({ error: err.message || "Form sync failed" });
  }
};
