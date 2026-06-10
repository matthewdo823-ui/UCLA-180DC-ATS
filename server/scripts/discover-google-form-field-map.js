/**
 * Prints Google Forms questionId → title lines for pasting into fieldMap.
 *
 * Usage (from server/):
 *   npm run discover-form-fields
 *   node scripts/discover-google-form-field-map.js
 *
 * Requires:
 *   - GOOGLE_CLOUD_KEY_PATH or GOOGLE_APPLICATION_CREDENTIALS (service account JSON)
 *   - formId from FORM_CONFIG_PATH / server/form-config.json, or override with GOOGLE_FORM_ID
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const {
  parseGoogleFormId,
  discoverFormQuestions,
  buildSuggestedFieldMap,
  loadLegacyFormConfig,
} = require("../src/utils/googleForm");

async function main() {
  const formId =
    parseGoogleFormId(process.env.GOOGLE_FORM_ID || "") ||
    loadLegacyFormConfig()?.formId;

  if (!formId) {
    console.error(
      "Set GOOGLE_FORM_ID, or put a real formId in form-config.json, or set FORM_CONFIG_PATH to a config file that contains formId."
    );
    process.exit(1);
  }

  const discovered = await discoverFormQuestions(formId);
  const suggested = buildSuggestedFieldMap(discovered.questions);

  console.log(`--- formId: ${discovered.formId} — suggested fieldMap ---\n`);
  (discovered.questions || []).forEach((item) => {
    const suggestedCol = suggested[item.questionId];
    const suffix = suggestedCol ? ` → ${suggestedCol}` : "";
    console.log(`  "${item.questionId}": ${JSON.stringify(item.title)}${suffix},`);
  });
  console.log("\nAllowed column names: see server/form-config.example.json fieldMap values.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
