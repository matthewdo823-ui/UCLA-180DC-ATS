/**
 * Google Forms → Supabase sync (cycle-scoped).
 *
 * Env:
 *   GOOGLE_CLOUD_KEY_PATH or GOOGLE_APPLICATION_CREDENTIALS — service account JSON key file
 *   FORM_CONFIG_PATH — legacy fallback path to form-config.json
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY — existing Supabase client
 */

const supabase = require("../config/supabase");
const { getActiveCycleId } = require("../utils/cycleContext");
const { mapFormResponseToCandidate } = require("../utils/dataMapper");
const { isGoogleDriveFileUrl } = require("../utils/drive");
const { resolveFormConfigPath } = require("../utils/formConfigPath");
const {
  getFormsClient,
  cycleRowToFormConfig,
  loadLegacyFormConfig,
  isGoogleFormsConfigured,
  getKeyFilePath,
} = require("../utils/googleForm");

async function fetchCyclesWithFormConfig(client = supabase) {
  const { data, error } = await client
    .from("cycles")
    .select("id, google_form_id, form_field_map, form_resume_question_id, form_headshot_question_id, status")
    .in("status", ["active", "draft"])
    .not("google_form_id", "is", null);

  if (error) throw error;
  return data || [];
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} cycleId
 */
async function upsertCandidateAndResume(client, mapped, cycleId) {
  const { candidateRow, resumeDerived } = mapped;

  candidateRow.cycle_id = cycleId;

  const { data, error } = await client
    .from("candidates")
    .upsert(candidateRow, { onConflict: "cycle_id,google_form_response_id" })
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

  if (!isGoogleDriveFileUrl(resumeDerived.file_url)) {
    console.warn(
      `[formsSync] Resume URL is not a Google Drive link for response ${mapped.google_form_response_id}; skipping resumes row.`
    );
    return;
  }

  const { data: existingResume, error: resumeSelectError } = await client
    .from("resumes")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("cycle_id", cycleId)
    .maybeSingle();

  if (resumeSelectError) throw resumeSelectError;

  const resumePayload = {
    name: resumeDerived.name,
    file_url: resumeDerived.file_url,
    cycle_id: cycleId,
  };

  if (existingResume) {
    const { error: updErr } = await client
      .from("resumes")
      .update({ ...resumePayload, candidate_id: candidateId })
      .eq("id", existingResume.id);
    if (updErr) throw updErr;
    return;
  }

  const { data: orphanResume, error: orphanError } = await client
    .from("resumes")
    .select("id")
    .eq("cycle_id", cycleId)
    .is("candidate_id", null)
    .ilike("name", resumeDerived.name)
    .maybeSingle();

  if (orphanError) throw orphanError;

  if (orphanResume) {
    const { error: claimErr } = await client
      .from("resumes")
      .update({ ...resumePayload, candidate_id: candidateId })
      .eq("id", orphanResume.id);
    if (claimErr) throw claimErr;
  } else {
    const { error: insErr } = await client.from("resumes").insert({
      candidate_id: candidateId,
      ...resumePayload,
    });
    if (insErr) throw insErr;
  }
}

/**
 * @param {{ cycleId: string, config: import('../utils/dataMapper').FormSyncConfig }} target
 * @returns {Promise<{ processed: number, errors: number }>}
 */
async function syncFormResponsesForCycle(target) {
  const { cycleId, config } = target;
  if (!cycleId) throw new Error("cycleId is required for form sync");
  if (!config?.formId) throw new Error("formId is required for form sync");

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
        await upsertCandidateAndResume(supabase, mapped, cycleId);
        processed += 1;
      } catch (e) {
        errors += 1;
        console.error(`[formsSync] Row error (cycle ${cycleId}):`, e.message || e);
      }
    }
  } while (pageToken);

  await supabase
    .from("cycles")
    .update({ last_form_sync_at: new Date().toISOString() })
    .eq("id", cycleId);

  return { processed, errors, cycleId };
}

/**
 * @param {string} [cycleId] — sync only this cycle; otherwise sync all configured non-archived cycles
 * @returns {Promise<{ processed: number, errors: number, cycles: Array<{ cycleId: string, processed: number, errors: number }> }>}
 */
async function syncFormResponsesToDatabase(cycleId) {
  if (cycleId) {
    const { data: cycle, error } = await supabase
      .from("cycles")
      .select("id, google_form_id, form_field_map, form_resume_question_id, form_headshot_question_id")
      .eq("id", cycleId)
      .maybeSingle();

    if (error) throw error;
    if (!cycle) throw new Error("Cycle not found");

    const config = cycleRowToFormConfig(cycle);
    if (!config) throw new Error("This cycle has no Google Form configured");

    const result = await syncFormResponsesForCycle({ cycleId: cycle.id, config });
    return {
      processed: result.processed,
      errors: result.errors,
      cycles: [{ cycleId: result.cycleId, processed: result.processed, errors: result.errors }],
    };
  }

  const configuredCycles = await fetchCyclesWithFormConfig();
  if (configuredCycles.length) {
    let totalProcessed = 0;
    let totalErrors = 0;
    const cycleResults = [];

    for (const cycle of configuredCycles) {
      const config = cycleRowToFormConfig(cycle);
      if (!config) continue;
      const result = await syncFormResponsesForCycle({ cycleId: cycle.id, config });
      totalProcessed += result.processed;
      totalErrors += result.errors;
      cycleResults.push({
        cycleId: result.cycleId,
        processed: result.processed,
        errors: result.errors,
      });
    }

    return { processed: totalProcessed, errors: totalErrors, cycles: cycleResults };
  }

  const legacyConfig = loadLegacyFormConfig();
  if (!legacyConfig) {
    throw new Error("No cycle form config found and no legacy form-config.json available");
  }

  const activeCycleId = await getActiveCycleId();
  if (!activeCycleId) {
    throw new Error("No active cycle — activate a cycle before syncing legacy form config");
  }

  const result = await syncFormResponsesForCycle({ cycleId: activeCycleId, config: legacyConfig });
  return {
    processed: result.processed,
    errors: result.errors,
    cycles: [{ cycleId: result.cycleId, processed: result.processed, errors: result.errors }],
  };
}

function isSyncConfigured() {
  if (!isGoogleFormsConfigured()) return false;
  return true;
}

function loadFormConfig() {
  const legacy = loadLegacyFormConfig();
  if (legacy) return legacy;
  throw new Error("No form config available");
}

module.exports = {
  syncFormResponsesToDatabase,
  syncFormResponsesForCycle,
  loadFormConfig,
  resolveFormConfigPath,
  getKeyFilePath,
  isSyncConfigured,
  fetchCyclesWithFormConfig,
};
