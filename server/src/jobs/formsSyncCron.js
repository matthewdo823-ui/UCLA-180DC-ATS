/**
 * Periodic Google Forms sync. Requires long-running Node process.
 *
 * Env:
 *   FORMS_SYNC_CRON — cron expression (default: every 10 minutes)
 */

const cron = require("node-cron");
const { syncFormResponsesToDatabase, isSyncConfigured } = require("../services/formsSyncService");

const DEFAULT_CRON = "*/10 * * * *";

async function runFormsSync(source) {
  console.log(`[formsSync] Starting ${source} sync...`);
  try {
    const { processed, errors } = await syncFormResponsesToDatabase();
    console.log(`[formsSync] Done. processed=${processed} errors=${errors}`);
  } catch (e) {
    console.error("[formsSync] Sync failed:", e.message || e);
  }
}

function startFormsSyncCron() {
  if (!isSyncConfigured()) {
    console.log(
      "[formsSync] Skipping cron: set GOOGLE_CLOUD_KEY_PATH (or GOOGLE_APPLICATION_CREDENTIALS) and configure a Google Form on at least one cycle."
    );
    return null;
  }

  const expression = process.env.FORMS_SYNC_CRON || DEFAULT_CRON;
  if (!cron.validate(expression)) {
    console.error(`[formsSync] Invalid FORMS_SYNC_CRON: ${expression}`);
    return null;
  }

  const task = cron.schedule(expression, () => runFormsSync("scheduled"));

  console.log(`[formsSync] Cron scheduled: ${expression}`);
  runFormsSync("startup");
  return task;
}

module.exports = { startFormsSyncCron };
