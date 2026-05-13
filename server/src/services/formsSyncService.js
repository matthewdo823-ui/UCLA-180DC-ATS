/**
 * Google Forms → Supabase sync.
 *
 * Env:
 *   GOOGLE_CLOUD_KEY_PATH or GOOGLE_APPLICATION_CREDENTIALS — service account JSON key file
 *   FORM_CONFIG_PATH — path to form-config.json (defaults to server/form-config.json)
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY — existing Supabase client
 */

const fs = require("fs");
const { google } = require("googleapis");
const supabase = require("../config/supabase");
const { mapFormResponseToCandidate } = require("../utils/dataMapper");
const { resolveFormConfigPath } = require("../utils/formConfigPath");

const SCOPES = [
  "https://www.googleapis.com/auth/forms.responses.readonly",
  "https://www.googleapis.com/auth/drive.readonly",
];

function getKeyFilePath() {
  return process.env.GOOGLE_CLOUD_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
}

function loadFormConfig() {
  const configPath = resolveFormConfigPath();
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw);
  const formId = parsed.formId;
  const fieldMap = parsed.fieldMap && typeof parsed.fieldMap === "object" ? parsed.fieldMap : {};
  if (!formId || typeof formId !== "string") {
    throw new Error("form-config.json: missing string formId");
  }
  return {
    formId,
    fieldMap,
    resumeQuestionId: typeof parsed.resumeQuestionId === "string" ? parsed.resumeQuestionId : undefined,
    headshotQuestionId: typeof parsed.headshotQuestionId === "string" ? parsed.headshotQuestionId : undefined,
  };
}

async function getFormsClient() {
  const keyFile = getKeyFilePath();
  if (!keyFile) {
    throw new Error("Set GOOGLE_CLOUD_KEY_PATH or GOOGLE_APPLICATION_CREDENTIALS to the service account JSON path.");
  }
  if (!fs.existsSync(keyFile)) {
    throw new Error(`Google key file not found: ${keyFile}`);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: SCOPES,
  });
  const authClient = await auth.getClient();
  return google.forms({ version: "v1", auth: authClient });
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 */
async function upsertCandidateAndResume(client, mapped) {
  const { candidateRow, resumeDerived } = mapped;

  const { data, error } = await client
    .from("candidates")
    .upsert(candidateRow, { onConflict: "google_form_response_id" })
    .select("id")
    .single();

  if (error) throw error;
  const candidateId = data.id;

  if (!resumeDerived.file_url) {
    console.warn(
      `[formsSync] No resume file URL for response ${mapped.google_form_response_id}; skipping resumes row.`
    );
    return;
  }

  const { data: existingResume, error: resumeSelectError } = await client
    .from("resumes")
    .select("id")
    .eq("candidate_id", candidateId)
    .maybeSingle();

  if (resumeSelectError) throw resumeSelectError;

  if (existingResume) {
    const { error: updErr } = await client
      .from("resumes")
      .update({
        name: resumeDerived.name,
        file_url: resumeDerived.file_url,
      })
      .eq("id", existingResume.id);
    if (updErr) throw updErr;
  } else {
    const { error: insErr } = await client.from("resumes").insert({
      candidate_id: candidateId,
      name: resumeDerived.name,
      file_url: resumeDerived.file_url,
    });
    if (insErr) throw insErr;
  }
}

/**
 * @returns {Promise<{ processed: number, errors: number }>}
 */
async function syncFormResponsesToDatabase() {
  const config = loadFormConfig();
  const forms = await getFormsClient();

  let processed = 0;
  let errors = 0;
  let pageToken;

  do {
    const res = await forms.forms.responses.list({
      formId: config.formId,
      pageToken: pageToken || undefined,
      pageSize: 500,
    });

    const responses = res.data.responses || [];
    pageToken = res.data.nextPageToken;

    for (const response of responses) {
      try {
        const mapped = mapFormResponseToCandidate(response, config);
        if (!mapped) {
          console.warn("[formsSync] Skipping response without responseId");
          continue;
        }
        await upsertCandidateAndResume(supabase, mapped);
        processed += 1;
      } catch (e) {
        errors += 1;
        console.error("[formsSync] Row error:", e.message || e);
      }
    }
  } while (pageToken);

  return { processed, errors };
}

function isSyncConfigured() {
  const keyOk = Boolean(getKeyFilePath());
  let configOk = false;
  try {
    const p = resolveFormConfigPath();
    configOk = fs.existsSync(p);
  } catch {
    configOk = false;
  }
  return keyOk && configOk;
}

module.exports = {
  syncFormResponsesToDatabase,
  loadFormConfig,
  resolveFormConfigPath,
  getKeyFilePath,
  isSyncConfigured,
};
