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
const { enqueueHeadshotDocuments } = require("./documentQueueService");
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
    .select("id, google_form_id, form_field_map, form_resume_question_id, form_headshot_question_id, status, last_form_sync_at")
    .in("status", ["active", "draft"])
    .not("google_form_id", "is", null);

  if (error) throw error;
  return data || [];
}

/** All resume rows in a cycle with no candidate attached yet (manual/CSV imports awaiting a match). */
async function fetchOrphanResumes(client, cycleId) {
  const { data, error } = await client
    .from("resumes")
    .select("id, name")
    .eq("cycle_id", cycleId)
    .is("candidate_id", null);

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

  // PostgREST upsert cannot target partial unique indexes (see postgrest-js#403).
  const responseId = candidateRow.google_form_response_id;
  let candidateId;

  if (responseId) {
    const { data: existing, error: selectError } = await client
      .from("candidates")
      .select("id")
      .eq("cycle_id", cycleId)
      .eq("google_form_response_id", responseId)
      .maybeSingle();

    if (selectError) throw selectError;

    if (existing) {
      const { data, error } = await client
        .from("candidates")
        .update(candidateRow)
        .eq("id", existing.id)
        .select("id")
        .single();
      if (error) throw error;
      candidateId = data.id;
    } else {
      const { data, error } = await client
        .from("candidates")
        .insert(candidateRow)
        .select("id")
        .single();
      if (error) throw error;
      candidateId = data.id;
    }
  } else {
    const { data, error } = await client
      .from("candidates")
      .insert(candidateRow)
      .select("id")
      .single();
    if (error) throw error;
    candidateId = data.id;
  }

  await enqueueHeadshotDocuments(
    client,
    [{ candidateId, headshot: candidateRow.headshot }],
    cycleId
  );

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
 * Batched fast path for a page of already-mapped responses: one upsert for all
 * candidates (relies on the full unique index on candidates(cycle_id, google_form_response_id),
 * see sql/add_cycle_form_config.sql), then per-page batched reads for resumes so only the
 * handful of rows that actually need a write hit the database individually.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {Array<{ candidateRow: object, resumeDerived: object }>} mappedRows
 * @param {string} cycleId
 * @param {Array<{ id: string, name: string }>} orphanResumes — mutated as orphans get claimed
 */
async function upsertCandidatesAndResumesBatch(client, mappedRows, cycleId, orphanResumes) {
  const candidateRows = mappedRows.map((m) => ({ ...m.candidateRow, cycle_id: cycleId }));

  const { data: upserted, error: upsertError } = await client
    .from("candidates")
    .upsert(candidateRows, { onConflict: "cycle_id,google_form_response_id" })
    .select("id, google_form_response_id");
  if (upsertError) throw upsertError;

  const candidateIdByResponseId = new Map(
    (upserted || []).map((row) => [row.google_form_response_id, row.id])
  );

  // Before the resume early-exit below: a candidate can have a headshot and no
  // resume, and that headshot still needs syncing.
  await enqueueHeadshotDocuments(
    client,
    mappedRows.map((m) => ({
      candidateId: candidateIdByResponseId.get(m.candidateRow.google_form_response_id),
      headshot: m.candidateRow.headshot,
    })),
    cycleId
  );

  const resumeItems = [];
  for (const { candidateRow, resumeDerived } of mappedRows) {
    const candidateId = candidateIdByResponseId.get(candidateRow.google_form_response_id);
    if (!candidateId) continue;

    if (!resumeDerived.file_url) {
      console.warn(
        `[formsSync] No resume file URL for response ${candidateRow.google_form_response_id}; skipping resumes row.`
      );
      continue;
    }
    if (!isGoogleDriveFileUrl(resumeDerived.file_url)) {
      console.warn(
        `[formsSync] Resume URL is not a Google Drive link for response ${candidateRow.google_form_response_id}; skipping resumes row.`
      );
      continue;
    }
    resumeItems.push({ candidateId, resumeDerived });
  }

  if (!resumeItems.length) return;

  const { data: existingResumes, error: existingError } = await client
    .from("resumes")
    .select("id, candidate_id")
    .eq("cycle_id", cycleId)
    .in("candidate_id", resumeItems.map((r) => r.candidateId));
  if (existingError) throw existingError;

  const existingResumeIdByCandidateId = new Map(
    (existingResumes || []).map((row) => [row.candidate_id, row.id])
  );

  const toInsert = [];
  const updates = [];

  for (const { candidateId, resumeDerived } of resumeItems) {
    const resumePayload = { name: resumeDerived.name, file_url: resumeDerived.file_url, cycle_id: cycleId };

    const existingId = existingResumeIdByCandidateId.get(candidateId);
    if (existingId) {
      updates.push(
        client.from("resumes").update({ ...resumePayload, candidate_id: candidateId }).eq("id", existingId)
      );
      continue;
    }

    const orphanIdx = orphanResumes.findIndex(
      (o) => (o.name || "").toLowerCase() === (resumeDerived.name || "").toLowerCase()
    );
    if (orphanIdx !== -1) {
      const [orphan] = orphanResumes.splice(orphanIdx, 1);
      updates.push(
        client.from("resumes").update({ ...resumePayload, candidate_id: candidateId }).eq("id", orphan.id)
      );
      continue;
    }

    toInsert.push({ candidate_id: candidateId, ...resumePayload });
  }

  if (toInsert.length) {
    const { error: insertError } = await client.from("resumes").insert(toInsert);
    if (insertError) throw insertError;
  }

  if (updates.length) {
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed) throw failed.error;
  }
}

/**
 * @param {{ cycleId: string, config: import('../utils/dataMapper').FormSyncConfig, lastSyncAt?: string|null }} target
 * @returns {Promise<{ processed: number, errors: number }>}
 */
async function syncFormResponsesForCycle(target) {
  const { cycleId, config, lastSyncAt } = target;
  if (!cycleId) throw new Error("cycleId is required for form sync");
  if (!config?.formId) throw new Error("formId is required for form sync");

  const forms = await getFormsClient();

  // Watermark taken before the fetch loop starts, so responses submitted while this run is
  // in flight are simply picked up (idempotently) on the next tick instead of being skipped.
  const syncStartedAt = new Date().toISOString();
  const filter = lastSyncAt ? `timestamp >= ${new Date(lastSyncAt).toISOString()}` : undefined;

  const orphanResumes = await fetchOrphanResumes(supabase, cycleId);

  let processed = 0;
  let errors = 0;
  let pageToken;

  do {
    const res = await forms.forms.responses.list({
      formId: config.formId,
      filter,
      pageToken: pageToken || undefined,
      pageSize: 500,
    });

    const responses = res.data.responses || [];
    pageToken = res.data.nextPageToken;

    const mappedRows = [];
    for (const response of responses) {
      const mapped = mapFormResponseToCandidate(response, config);
      if (!mapped) {
        console.warn("[formsSync] Skipping response without responseId");
        continue;
      }
      mappedRows.push(mapped);
    }

    if (!mappedRows.length) continue;

    try {
      await upsertCandidatesAndResumesBatch(supabase, mappedRows, cycleId, orphanResumes);
      processed += mappedRows.length;
    } catch (e) {
      console.error(`[formsSync] Batch upsert failed (cycle ${cycleId}), falling back to per-row:`, e.message || e);
      for (const mapped of mappedRows) {
        try {
          await upsertCandidateAndResume(supabase, mapped, cycleId);
          processed += 1;
        } catch (rowError) {
          errors += 1;
          console.error(`[formsSync] Row error (cycle ${cycleId}):`, rowError.message || rowError);
        }
      }
    }
  } while (pageToken);

  await supabase
    .from("cycles")
    .update({ last_form_sync_at: syncStartedAt })
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
      .select("id, google_form_id, form_field_map, form_resume_question_id, form_headshot_question_id, last_form_sync_at")
      .eq("id", cycleId)
      .maybeSingle();

    if (error) throw error;
    if (!cycle) throw new Error("Cycle not found");

    const config = cycleRowToFormConfig(cycle);
    if (!config) throw new Error("This cycle has no Google Form configured");

    const result = await syncFormResponsesForCycle({ cycleId: cycle.id, config, lastSyncAt: cycle.last_form_sync_at });
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
      const result = await syncFormResponsesForCycle({ cycleId: cycle.id, config, lastSyncAt: cycle.last_form_sync_at });
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

  const { data: activeCycle, error: activeCycleError } = await supabase
    .from("cycles")
    .select("last_form_sync_at")
    .eq("id", activeCycleId)
    .maybeSingle();
  if (activeCycleError) throw activeCycleError;

  const result = await syncFormResponsesForCycle({
    cycleId: activeCycleId,
    config: legacyConfig,
    lastSyncAt: activeCycle?.last_form_sync_at,
  });
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
