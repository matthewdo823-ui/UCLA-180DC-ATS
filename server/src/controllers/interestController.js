const supabase = require("../config/supabase");
const { respondWithServerError } = require("../utils/httpErrors");
const { mapInterestReviewEntry } = require("../utils/adminWorkflowViews");
const {
  INTEREST_FIELD_TARGETS,
  INTEREST_TITLE_HINTS,
  parseGoogleFormId,
  googleFormUrlError,
  discoverFormQuestions,
  buildSuggestedFieldMap,
  validateInterestFieldMap,
  isGoogleFormsConfigured,
} = require("../utils/googleForm");
const { suggestCandidateByName } = require("../utils/demonstratedInterest");
const {
  fetchAllPages,
  buildCycleMatchIndex,
  classifyEventAttendance,
  syncInterestEvent,
} = require("../services/interestSyncService");

const REVIEW_STATUSES = new Set(["unmatched", "late"]);
const NOT_CONFIGURED = { error: "Google Forms sync is not configured. Set GOOGLE_CLOUD_KEY_PATH on the server." };

function mapInterestEvent(row, counts = {}) {
  return {
    id: row.id,
    cycleId: row.cycle_id,
    name: row.name,
    closesAt: row.closes_at,
    googleFormId: row.google_form_id || null,
    fieldMap: row.field_map || null,
    formTitle: row.form_title || null,
    mappingStatus: row.mapping_status,
    mappingError: row.mapping_error || null,
    lastSyncAt: row.last_sync_at || null,
    sortOrder: row.sort_order,
    counts: { counted: 0, unmatched: 0, late: 0, dismissed: 0, ...counts },
  };
}

function parseClosesAt(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function fetchEvent(eventId) {
  const { data, error } = await supabase.from("interest_events").select("*").eq("id", eventId).maybeSingle();
  if (error) throw error;
  return data;
}

async function countAttendanceByEvent(cycleId) {
  const rows = await fetchAllPages(() =>
    supabase.from("interest_attendance").select("id, event_id, status").eq("cycle_id", cycleId).order("id")
  );
  const counts = {};
  rows.forEach((row) => {
    counts[row.event_id] = counts[row.event_id] || {};
    counts[row.event_id][row.status] = (counts[row.event_id][row.status] || 0) + 1;
  });
  return counts;
}

async function respondWithEvent(res, eventId, extras = {}, status = 200) {
  const event = await fetchEvent(eventId);
  if (!event) return res.status(404).json({ error: "Event not found" });
  const counts = await countAttendanceByEvent(event.cycle_id);
  return res.status(status).json({ event: mapInterestEvent(event, counts[event.id]), ...extras });
}

exports.listInterestEvents = async (req, res) => {
  const cycleId = String(req.params.cycleId || "").trim();
  try {
    const { data, error } = await supabase
      .from("interest_events")
      .select("*")
      .eq("cycle_id", cycleId)
      .order("sort_order")
      .order("closes_at");
    if (error) return respondWithServerError(res, error, "listInterestEvents");
    const counts = await countAttendanceByEvent(cycleId);
    return res.json({
      events: (data || []).map((row) => mapInterestEvent(row, counts[row.id])),
      fieldTargets: INTEREST_FIELD_TARGETS,
    });
  } catch (err) {
    return respondWithServerError(res, err, "listInterestEvents");
  }
};

exports.createInterestEvent = async (req, res) => {
  const cycleId = String(req.params.cycleId || "").trim();
  const name = String(req.body?.name || "").trim();
  const closesAt = parseClosesAt(req.body?.closesAt);
  if (!name) return res.status(400).json({ error: "Event name is required" });
  if (!closesAt) return res.status(400).json({ error: "A valid form close time is required" });

  let googleFormId = null;
  if (req.body?.formUrl) {
    googleFormId = parseGoogleFormId(req.body.formUrl);
    if (!googleFormId) return res.status(400).json({ error: googleFormUrlError(req.body.formUrl) });
  }

  try {
    const { count, error: countError } = await supabase
      .from("interest_events")
      .select("id", { count: "exact", head: true })
      .eq("cycle_id", cycleId);
    if (countError) return respondWithServerError(res, countError, "createInterestEvent count");

    const { data, error } = await supabase
      .from("interest_events")
      .insert({ cycle_id: cycleId, name, closes_at: closesAt, google_form_id: googleFormId, sort_order: count || 0 })
      .select("*")
      .single();
    if (error) return respondWithServerError(res, error, "createInterestEvent");
    return res.status(201).json({ event: mapInterestEvent(data) });
  } catch (err) {
    return respondWithServerError(res, err, "createInterestEvent");
  }
};

exports.patchInterestEvent = async (req, res) => {
  const eventId = String(req.params.eventId || "").trim();
  try {
    const event = await fetchEvent(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const updates = {};
    if (req.body?.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (!name) return res.status(400).json({ error: "Event name is required" });
      updates.name = name;
    }
    if (req.body?.closesAt !== undefined) {
      const closesAt = parseClosesAt(req.body.closesAt);
      if (!closesAt) return res.status(400).json({ error: "A valid form close time is required" });
      updates.closes_at = closesAt;
    }
    if (req.body?.sortOrder !== undefined && Number.isInteger(req.body.sortOrder)) {
      updates.sort_order = req.body.sortOrder;
    }

    let formChanged = false;
    if (req.body?.formUrl !== undefined) {
      const formId = req.body.formUrl ? parseGoogleFormId(req.body.formUrl) : null;
      if (req.body.formUrl && !formId) return res.status(400).json({ error: googleFormUrlError(req.body.formUrl) });
      formChanged = formId !== event.google_form_id;
      if (formChanged) {
        // Rows belong to the form they came from; a different form starts from scratch.
        Object.assign(updates, {
          google_form_id: formId,
          field_map: null,
          form_title: null,
          mapping_status: "unconfigured",
          mapping_error: null,
          last_sync_at: null,
        });
      }
    }
    // A field map in the same request as a new URL was discovered against that new form, so keep it.
    const hasForm = Boolean(formChanged ? updates.google_form_id : event.google_form_id);
    if (req.body?.fieldMap !== undefined) {
      if (!hasForm) return res.status(400).json({ error: "Add a Google Form URL before mapping fields" });
      const mapError = validateInterestFieldMap(req.body.fieldMap);
      if (mapError) return res.status(400).json({ error: mapError });
      // The admin mapped against freshly discovered questions; the next sync re-verifies drift.
      Object.assign(updates, { field_map: req.body.fieldMap, mapping_status: "ok", mapping_error: null });
    }
    if (typeof req.body?.formTitle === "string" && hasForm) {
      updates.form_title = req.body.formTitle.trim() || null;
    }

    if (!Object.keys(updates).length) return res.status(400).json({ error: "No valid fields to update" });

    if (formChanged) {
      const { error: clearError } = await supabase.from("interest_attendance").delete().eq("event_id", eventId);
      if (clearError) return respondWithServerError(res, clearError, "patchInterestEvent clear");
    }

    const { data: updated, error } = await supabase
      .from("interest_events")
      .update(updates)
      .eq("id", eventId)
      .select("*")
      .single();
    if (error) return respondWithServerError(res, error, "patchInterestEvent");

    // A remap or new close time re-classifies stored answers without calling Google.
    let reclassified = 0;
    if (updates.field_map || updates.closes_at) {
      reclassified = (await classifyEventAttendance(updated)).updated;
    }
    return respondWithEvent(res, eventId, { reclassified });
  } catch (err) {
    return respondWithServerError(res, err, "patchInterestEvent");
  }
};

exports.deleteInterestEvent = async (req, res) => {
  const eventId = String(req.params.eventId || "").trim();
  try {
    const { data, error } = await supabase.from("interest_events").delete().eq("id", eventId).select("id");
    if (error) return respondWithServerError(res, error, "deleteInterestEvent");
    if (!data?.length) return res.status(404).json({ error: "Event not found" });
    return res.json({ deleted: true });
  } catch (err) {
    return respondWithServerError(res, err, "deleteInterestEvent");
  }
};

exports.discoverInterestEventFields = async (req, res) => {
  const eventId = String(req.params.eventId || "").trim();
  if (!isGoogleFormsConfigured()) return res.status(503).json(NOT_CONFIGURED);
  try {
    const event = await fetchEvent(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const formInput = req.body?.formUrl ?? event.google_form_id;
    const formId = parseGoogleFormId(formInput);
    if (!formId) {
      return res.status(400).json({ error: formInput ? googleFormUrlError(formInput) : "Provide a Google Form edit URL or save one on this event first." });
    }

    const discovered = await discoverFormQuestions(formId);
    return res.json({
      formId: discovered.formId,
      formTitle: discovered.formTitle,
      questions: discovered.questions,
      suggestedFieldMap: buildSuggestedFieldMap(discovered.questions, INTEREST_TITLE_HINTS),
      fieldTargets: INTEREST_FIELD_TARGETS,
    });
  } catch (err) {
    return respondWithServerError(res, err, "discoverInterestEventFields", "Could not discover form fields. Is the form shared with the service account?");
  }
};

exports.syncInterestEventNow = async (req, res) => {
  const eventId = String(req.params.eventId || "").trim();
  if (!isGoogleFormsConfigured()) return res.status(503).json(NOT_CONFIGURED);
  try {
    const event = await fetchEvent(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });
    if (!event.google_form_id) return res.status(400).json({ error: "Save a Google Form URL on this event first" });

    const result = await syncInterestEvent(event, { force: true });
    return respondWithEvent(res, eventId, { result });
  } catch (err) {
    return respondWithServerError(res, err, "syncInterestEventNow", "Sync failed. Is the form shared with the service account?");
  }
};

exports.listInterestAttendance = async (req, res) => {
  const cycleId = String(req.params.cycleId || "").trim();
  const statuses = String(req.query.status || "unmatched,late")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => REVIEW_STATUSES.has(s));
  if (!statuses.length) return res.status(400).json({ error: "status must include unmatched and/or late" });

  try {
    const rows = await fetchAllPages(() =>
      supabase
        .from("interest_attendance")
        .select("id, event_id, submitted_at, submitted_name, submitted_email, submitted_university_id, candidate_id, match_method, status, interest_events!inner(name)")
        .eq("cycle_id", cycleId)
        .in("status", statuses)
        .order("submitted_at")
    );
    if (!rows.length) return res.json({ entries: [], candidates: [] });

    const candidates = await fetchAllPages(() =>
      supabase.from("candidates").select("id, name, email, university_id").eq("cycle_id", cycleId).order("name")
    );
    const byId = new Map(candidates.map((c) => [c.id, c]));
    const index = await buildCycleMatchIndex(cycleId);

    const entries = rows.map((row) => {
      const matched = row.candidate_id ? byId.get(row.candidate_id) : null;
      const suggestion = matched ? null : suggestCandidateByName(row.submitted_name, index);
      return mapInterestReviewEntry(row, { matched, suggestion });
    });

    return res.json({
      entries,
      candidates: candidates.map((c) => ({ id: c.id, name: c.name, email: c.email })),
    });
  } catch (err) {
    return respondWithServerError(res, err, "listInterestAttendance");
  }
};

exports.resolveInterestAttendance = async (req, res) => {
  const attendanceId = String(req.params.attendanceId || "").trim();
  const action = req.body?.action;
  try {
    const { data: row, error } = await supabase
      .from("interest_attendance")
      .select("id, event_id, cycle_id, candidate_id, status")
      .eq("id", attendanceId)
      .maybeSingle();
    if (error) return respondWithServerError(res, error, "resolveInterestAttendance");
    if (!row) return res.status(404).json({ error: "Attendance entry not found" });

    const resolved = { resolved_by: req.user?.user_id ?? null, resolved_at: new Date().toISOString() };
    let updates;
    if (action === "match") {
      const candidateId = String(req.body?.candidateId || "").trim();
      const { data: candidate, error: candidateError } = await supabase
        .from("candidates")
        .select("id")
        .eq("id", candidateId)
        .eq("cycle_id", row.cycle_id)
        .maybeSingle();
      if (candidateError) return respondWithServerError(res, candidateError, "resolveInterestAttendance candidate");
      if (!candidate) return res.status(400).json({ error: "Pick a candidate from this cycle" });
      updates = { ...resolved, candidate_id: candidate.id, match_method: "admin", status: "counted" };
    } else if (action === "approve") {
      if (!row.candidate_id) return res.status(400).json({ error: "Match this entry to a candidate before approving it" });
      updates = { ...resolved, status: "counted" };
    } else if (action === "dismiss") {
      updates = { ...resolved, status: "dismissed" };
    } else if (action === "reset") {
      updates = { resolved_by: null, resolved_at: null, match_method: null, candidate_id: null, status: "unmatched" };
    } else {
      return res.status(400).json({ error: "action must be match, approve, dismiss, or reset" });
    }

    const { error: updateError } = await supabase.from("interest_attendance").update(updates).eq("id", attendanceId);
    if (updateError) return respondWithServerError(res, updateError, "resolveInterestAttendance update");

    if (action === "reset") {
      const event = await fetchEvent(row.event_id);
      if (event) await classifyEventAttendance(event);
    }
    return res.json({ ok: true });
  } catch (err) {
    return respondWithServerError(res, err, "resolveInterestAttendance");
  }
};
