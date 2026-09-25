/**
 * Periodic Google Forms sync via node-cron (local / long-running hosts).
 * On Vercel, use client/vercel.json cron → /api/cron/forms-sync instead and set
 * DISABLE_FORMS_SYNC_CRON=1 on the API server.
 *
 * Env:
 *   FORMS_SYNC_CRON — cron expression (default: every 10 minutes)
 *   DISABLE_FORMS_SYNC_CRON — set to 1 to skip in-process cron
 */

const cron = require("node-cron");
const { syncFormResponsesToDatabase, isSyncConfigured } = require("../services/formsSyncService");
const { syncAllInterestEvents } = require("../services/interestSyncService");

const DEFAULT_CRON = "*/10 * * * *";

async function runFormsSync(source) {
  console.log(`[formsSync] Starting ${source} sync...`);
  try {
    const { processed, errors } = await syncFormResponsesToDatabase();
    console.log(`[formsSync] Done. processed=${processed} errors=${errors}`);
  } catch (e) {
    console.error("[formsSync] Sync failed:", e.message || e);
  }
  try {
    const cycles = await syncAllInterestEvents();
    console.log(`[interestSync] Done. cycles=${cycles.length}`);
  } catch (e) {
    console.error("[interestSync] Sync failed:", e.message || e);
  }
}

function startFormsSyncCron() {
  if (process.env.DISABLE_FORMS_SYNC_CRON === "1") {
    console.log("[formsSync] In-process cron disabled (use Vercel cron or manual sync).");
    return null;
  }

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

  // noOverlap: a slow run (many events x paged Google fetches) must not have the
  // next tick start a second concurrent pass over the same tables.
  const task = cron.schedule(expression, () => runFormsSync("scheduled"), { noOverlap: true });

  console.log(`[formsSync] Cron scheduled: ${expression}`);
  runFormsSync("startup");
  return task;
}

module.exports = { startFormsSyncCron };
