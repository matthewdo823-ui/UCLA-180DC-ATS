/**
 * Prints Google Forms questionId → title lines for pasting into fieldMap in form-config.json.
 *
 * Usage (from server/):
 *   npm run discover-form-fields
 *   node scripts/discover-google-form-field-map.js
 *
 * Requires:
 *   - GOOGLE_CLOUD_KEY_PATH or GOOGLE_APPLICATION_CREDENTIALS (service account JSON)
 *   - formId from FORM_CONFIG_PATH / server/form-config.json, or override with GOOGLE_FORM_ID
 *
 * Service account needs Forms API access to the form (editor or shared appropriately).
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const fs = require("fs");
const { google } = require("googleapis");
const { resolveFormConfigPath } = require("../src/utils/formConfigPath");

function readFormIdFromDisk() {
  const primary = resolveFormConfigPath();
  if (fs.existsSync(primary)) {
    const parsed = JSON.parse(fs.readFileSync(primary, "utf8"));
    const id = parsed.formId;
    if (typeof id === "string" && id.trim() && !/^YOUR_/i.test(id.trim())) {
      return id.trim();
    }
  }
  const examplePath = path.join(__dirname, "..", "form-config.example.json");
  if (fs.existsSync(examplePath)) {
    const parsed = JSON.parse(fs.readFileSync(examplePath, "utf8"));
    const id = parsed.formId;
    if (typeof id === "string" && id.trim() && !/^YOUR_/i.test(id.trim())) {
      return id.trim();
    }
  }
  return null;
}

async function main() {
  const formId = (process.env.GOOGLE_FORM_ID || "").trim() || readFormIdFromDisk();
  if (!formId) {
    console.error(
      "Set GOOGLE_FORM_ID, or put a real formId in form-config.json (or form-config.example.json), or set FORM_CONFIG_PATH to a config file that contains formId."
    );
    process.exit(1);
  }

  if (!google?.auth) {
    throw new Error("googleapis failed to load.");
  }

  const keyFile = process.env.GOOGLE_CLOUD_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
  const auth = new google.auth.GoogleAuth({
    ...(keyFile ? { keyFile } : {}),
    scopes: ["https://www.googleapis.com/auth/forms.body.readonly"],
  });

  const forms = google.forms({ version: "v1", auth });
  const res = await forms.forms.get({ formId });

  console.log(`--- formId: ${formId} — copy into fieldMap; replace values with candidates column names ---\n`);
  (res.data.items || []).forEach(item => {
    if (item.questionItem?.question?.questionId) {
      const qid = item.questionItem.question.questionId;
      const title = (item.title || "").replace(/\s+/g, " ").trim() || "untitled";
      console.log(`  "${qid}": ${JSON.stringify(title)},`);
    }
  });
  console.log("\nAllowed column names: see server/form-config.example.json fieldMap values.");
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
