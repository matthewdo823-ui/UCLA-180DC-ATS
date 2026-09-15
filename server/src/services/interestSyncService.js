/**
 * Demonstrated Interest: per-event Google Form attendance → interest_attendance.
 *
 * Each sync is two phases:
 *   1. ingest   — drift-check the form's questions, then upsert raw responses (all answers as text).
 *   2. classify — derive name/email/UID from stored answers via the event's field_map and
 *                 match to candidates. Runs on every sync (so attendees who apply later get
 *                 matched) and after a remap (no Google call needed). Admin-resolved rows are frozen.
 */

const supabase = require("../config/supabase");
const { extractTextFromAnswer } = require("../utils/dataMapper");
const { isMissingSchemaError } = require("../utils/schemaCompatibility");
const { getFormsClient, discoverFormQuestions, validateInterestFieldMap } = require("../utils/googleForm");
const {
  extractMappedFields,
  findMissingMappedQuestions,
  buildCandidateMatchIndex,
  classifyAttendance,
  groupAttendedEventsByCandidate,
} = require("../utils/demonstratedInterest");

const PAGE_SIZE = 1000;
// Google fetches stop a week after close; classification keeps running so late applicants still match.
const FETCH_WINDOW_AFTER_CLOSE_MS = 7 * 24 * 60 * 60 * 1000;
const TARGET_LABELS = { name: "Name", email: "Email", university_id: "University ID" };

async function fetchAllPages(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function buildCycleMatchIndex(cycleId) {
  const candidates = await fetchAllPages(() =>
    supabase.from("candidates").select("id, name, email, university_id").eq("cycle_id", cycleId).order("id")
  );
  return buildCandidateMatchIndex(candidates);
}

function answersToText(answers) {
  const text = {};
  Object.entries(answers || {}).forEach(([questionId, answer]) => {
    text[questionId] = extractTextFromAnswer(answer);
  });
  return text;
}

function isMappingUsable(event) {
  return event.mapping_status === "ok" && !validateInterestFieldMap(event.field_map);
}

/** Compare the saved field_map with the live form; returns the mapping status to store. */
async function checkMappingDrift(event) {
  const discovered = await discoverFormQuestions(event.google_form_id);
  const updates = { form_title: discovered.formTitle || event.form_title || null };

  const mapError = validateInterestFieldMap(event.field_map);
  if (mapError) {
    Object.assign(updates, { mapping_status: "unconfigured", mapping_error: null });
  } else {
    const missing = findMissingMappedQuestions(event.field_map, discovered.questions);
    Object.assign(updates, missing.length
      ? {
        mapping_status: "stale",
        mapping_error: `Form changed: the mapped ${missing.map((m) => TARGET_LABELS[m.target] || m.target).join(", ")} question no longer exists. Re-map fields.`,
      }
      : { mapping_status: "ok", mapping_error: null });
  }

  const { error } = await supabase.from("interest_events").update(updates).eq("id", event.id);
  if (error) throw error;
  return { ...event, ...updates };
}

async function ingestResponses(event, forms, syncStartedAt) {
  const filter = event.last_sync_at ? `timestamp >= ${new Date(event.last_sync_at).toISOString()}` : undefined;
  let ingested = 0;
  let pageToken;

  do {
    const res = await forms.forms.responses.list({
      formId: event.google_form_id,
      filter,
      pageToken: pageToken || undefined,
      pageSize: 500,
    });
    pageToken = res.data.nextPageToken;

    // Raw columns only: on conflict PostgREST updates just these, leaving status/candidate intact.
    const rows = (res.data.responses || [])
      .filter((response) => response.responseId)
      .map((response) => ({
        event_id: event.id,
        cycle_id: event.cycle_id,
        google_form_response_id: response.responseId,
        submitted_at: response.createTime || response.lastSubmittedTime || syncStartedAt,
        answers: answersToText(response.answers),
      }));
    if (!rows.length) continue;

    const { error } = await supabase
      .from("interest_attendance")
      .upsert(rows, { onConflict: "event_id,google_form_response_id" });
    if (error) throw error;
    ingested += rows.length;
  } while (pageToken);

  return ingested;
}

/**
 * Re-derive submitted_* fields and match status for every row an admin hasn't resolved.
 * @returns {Promise<{ updated: number }>}
 */
async function classifyEventAttendance(event, candidateIndex) {
  if (!isMappingUsable(event)) return { updated: 0 };
  const index = candidateIndex || await buildCycleMatchIndex(event.cycle_id);

  const rows = await fetchAllPages(() =>
    supabase
      .from("interest_attendance")
      .select("id, event_id, cycle_id, google_form_response_id, submitted_at, answers, submitted_name, submitted_email, submitted_university_id, candidate_id, match_method, status")
      .eq("event_id", event.id)
      .is("resolved_at", null)
      .order("id")
  );

  const changed = [];
  rows.forEach((row) => {
    const fields = extractMappedFields(row.answers, event.field_map);
    const result = classifyAttendance({ submittedAt: row.submitted_at, fields }, event, index);
    const next = {
      ...row,
      submitted_name: fields.name,
      submitted_email: fields.email,
      submitted_university_id: fields.universityId,
      candidate_id: result.candidateId,
      match_method: result.matchMethod,
      status: result.status,
    };
    const differs = ["submitted_name", "submitted_email", "submitted_university_id", "candidate_id", "match_method", "status"]
      .some((key) => (row[key] ?? null) !== (next[key] ?? null));
    if (differs) changed.push(next);
  });

  for (let i = 0; i < changed.length; i += 500) {
    const { error } = await supabase
      .from("interest_attendance")
      .upsert(changed.slice(i, i + 500), { onConflict: "id" });
    if (error) throw error;
  }
  return { updated: changed.length };
}

/**
 * @param {object} event interest_events row
 * @param {{ forms?: object, candidateIndex?: object, force?: boolean }} [options]
 */
async function syncInterestEvent(event, { forms, candidateIndex, force = false } = {}) {
  const result = { eventId: event.id, name: event.name, ingested: 0, classified: 0, mappingStatus: event.mapping_status, skippedFetch: false };
  let current = event;

  const closedLongAgo = Date.now() - new Date(event.closes_at).getTime() > FETCH_WINDOW_AFTER_CLOSE_MS;
  if (event.google_form_id && (force || !closedLongAgo)) {
    const syncStartedAt = new Date().toISOString();
    current = await checkMappingDrift(event);
    result.mappingStatus = current.mapping_status;
    // Raw answers are stored even when the mapping is stale, so a remap can classify them later.
    result.ingested = await ingestResponses(current, forms || await getFormsClient(), syncStartedAt);
    const { error } = await supabase.from("interest_events").update({ last_sync_at: syncStartedAt }).eq("id", event.id);
    if (error) throw error;
  } else {
    result.skippedFetch = true;
  }

  result.classified = (await classifyEventAttendance(current, candidateIndex)).updated;
  return result;
}

async function syncInterestEventsForCycle(cycleId, { force = false } = {}) {
  const { data: events, error } = await supabase
    .from("interest_events")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("sort_order")
    .order("closes_at");
  if (error) throw error;
  if (!events?.length) return [];

  const [forms, candidateIndex] = await Promise.all([
    events.some((e) => e.google_form_id) ? getFormsClient() : null,
    buildCycleMatchIndex(cycleId),
  ]);

  const results = [];
  for (const event of events) {
    try {
      results.push(await syncInterestEvent(event, { forms, candidateIndex, force }));
    } catch (e) {
      // One misconfigured form (e.g. not shared with the service account) shouldn't block the rest.
      console.error(`[interestSync] Event ${event.id} (${event.name}) failed:`, e.message || e);
      results.push({ eventId: event.id, name: event.name, error: e.message || String(e) });
    }
  }
  return results;
}

/**
 * Counted attendance for scoring: candidate id -> distinct events.
 * Returns an empty map until add_demonstrated_interest.sql is applied, so scoreboards keep working.
 * @returns {Promise<Map<string, Array<{ id: string, name: string }>>>}
 */
async function loadAttendedEventsByCandidate(cycleId, { candidateId = null } = {}) {
  if (!cycleId) return new Map();
  try {
    const rows = await fetchAllPages(() => {
      let query = supabase
        .from("interest_attendance")
        .select("id, candidate_id, event_id, interest_events(name)")
        .eq("cycle_id", cycleId)
        .eq("status", "counted")
        .not("candidate_id", "is", null);
      if (candidateId) query = query.eq("candidate_id", candidateId);
      return query.order("id");
    });
    return groupAttendedEventsByCandidate(rows.map((row) => ({
      candidate_id: row.candidate_id,
      event_id: row.event_id,
      event_name: row.interest_events?.name,
    })));
  } catch (err) {
    if (isMissingSchemaError(err)) return new Map();
    throw err;
  }
}

/** Cron entry point: every non-archived cycle that has DI events. */
async function syncAllInterestEvents() {
  const { data: cycles, error } = await supabase
    .from("cycles")
    .select("id, interest_events!inner(id)")
    .in("status", ["active", "draft"]);
  if (error) throw error;

  const results = [];
  for (const cycle of cycles || []) {
    results.push({ cycleId: cycle.id, events: await syncInterestEventsForCycle(cycle.id) });
  }
  return results;
}

module.exports = {
  fetchAllPages,
  buildCycleMatchIndex,
  classifyEventAttendance,
  syncInterestEvent,
  syncInterestEventsForCycle,
  syncAllInterestEvents,
  loadAttendedEventsByCandidate,
};
