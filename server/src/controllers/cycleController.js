const supabase = require("../config/supabase");
const { getActiveCycleId } = require("../utils/cycleContext");
const { assertDeliberationCompleteForRound } = require("../services/roundDeliberationService");
const { DEFAULT_RUBRIC_CONFIG, validateRubricConfig } = require("../utils/rubric");
const { syncFormResponsesToDatabase } = require("../services/formsSyncService");
const {
  CANDIDATE_COLUMNS,
  parseGoogleFormId,
  discoverFormQuestions,
  buildSuggestedFieldMap,
  inferFileQuestionIds,
  validateFieldMap,
  isGoogleFormsConfigured,
} = require("../utils/googleForm");
const { respondWithServerError } = require("../utils/httpErrors");
const {
  ROUND_TYPES,
  DEFAULT_CYCLE_ROUNDS,
  isKnownRoundType,
} = require("../utils/rounds");

const CYCLE_STATUSES = new Set(["draft", "active", "archived"]);
const ROUND_STATUSES = new Set(["draft", "active", "closed"]);

function slugify(name) {
  const base = String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "cycle";
}

function mapRound(row) {
  if (!row) return null;
  return {
    id: row.id,
    cycleId: row.cycle_id,
    name: row.name,
    type: row.type,
    status: row.status,
    sortOrder: row.sort_order,
    rubricConfig: row.rubric_config || null,
    autoAdvancePercent: Number(row.auto_advance_percent) || 0,
    autoRejectPercent: Number(row.auto_reject_percent) || 0,
    createdAt: row.created_at,
  };
}

function mapCycle(row, extras = {}) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    googleFormId: row.google_form_id || null,
    formFieldMap: row.form_field_map || null,
    formResumeQuestionId: row.form_resume_question_id || null,
    formHeadshotQuestionId: row.form_headshot_question_id || null,
    lastFormSyncAt: row.last_form_sync_at || null,
    hasFormConfig: Boolean(row.google_form_id && row.form_field_map),
    ...extras,
  };
}

async function fetchCycleCounts(cycleIds) {
  const counts = {};
  cycleIds.forEach((id) => {
    counts[id] = { candidates: 0, resumes: 0, reviews: 0 };
  });
  if (!cycleIds.length) return counts;

  const [candidatesRes, resumesRes, reviewsRes] = await Promise.all([
    supabase.from("candidates").select("cycle_id").in("cycle_id", cycleIds),
    supabase.from("resumes").select("cycle_id").in("cycle_id", cycleIds),
    supabase.from("resume_reviews").select("cycle_id").in("cycle_id", cycleIds),
  ]);

  if (candidatesRes.error) throw candidatesRes.error;
  if (resumesRes.error) throw resumesRes.error;
  if (reviewsRes.error) throw reviewsRes.error;

  (candidatesRes.data || []).forEach((row) => {
    if (row.cycle_id && counts[row.cycle_id]) counts[row.cycle_id].candidates += 1;
  });
  (resumesRes.data || []).forEach((row) => {
    if (row.cycle_id && counts[row.cycle_id]) counts[row.cycle_id].resumes += 1;
  });
  (reviewsRes.data || []).forEach((row) => {
    if (row.cycle_id && counts[row.cycle_id]) counts[row.cycle_id].reviews += 1;
  });

  return counts;
}

async function fetchRoundsForCycles(cycleIds) {
  if (!cycleIds.length) return {};

  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .in("cycle_id", cycleIds)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  const grouped = {};
  (data || []).forEach((row) => {
    if (!grouped[row.cycle_id]) grouped[row.cycle_id] = [];
    grouped[row.cycle_id].push(mapRound(row));
  });
  return grouped;
}

async function buildActiveCyclePayload() {
  const activeCycleId = await getActiveCycleId();
  if (!activeCycleId) {
    return { cycle: null, rounds: [], activeRound: null };
  }

  const { data: cycle, error: cycleError } = await supabase
    .from("cycles")
    .select("*")
    .eq("id", activeCycleId)
    .maybeSingle();

  if (cycleError) throw cycleError;
  if (!cycle) {
    return { cycle: null, rounds: [], activeRound: null };
  }

  const { data: rounds, error: roundsError } = await supabase
    .from("rounds")
    .select("*")
    .eq("cycle_id", activeCycleId)
    .order("sort_order", { ascending: true });

  if (roundsError) throw roundsError;

  const mappedRounds = (rounds || []).map(mapRound);
  const activeRound = mappedRounds.find((r) => r.status === "active") || null;

  return {
    cycle: mapCycle(cycle, { isActive: true }),
    rounds: mappedRounds,
    activeRound,
  };
}

async function applyActiveCycleSwitch(cycleId) {
  const { error } = await supabase.rpc("activate_cycle", { p_cycle_id: cycleId });
  if (error) throw error;
}

async function ensureUniqueSlug(baseSlug) {
  let slug = baseSlug;
  let suffix = 2;

  while (true) {
    const { data, error } = await supabase
      .from("cycles")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    if (error) throw error;
    if (!data) return slug;
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

exports.listCycles = async (req, res) => {
  try {
    const { data: cycles, error } = await supabase
      .from("cycles")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return respondWithServerError(res, error, "listCycles");

    const cycleIds = (cycles || []).map((c) => c.id);
    const activeCycleId = await getActiveCycleId();
    const [countsByCycle, roundsByCycle] = await Promise.all([
      fetchCycleCounts(cycleIds),
      fetchRoundsForCycles(cycleIds),
    ]);

    return res.json({
      cycles: (cycles || []).map((cycle) =>
        mapCycle(cycle, {
          isActive: cycle.id === activeCycleId,
          counts: countsByCycle[cycle.id] || { candidates: 0, resumes: 0, reviews: 0 },
          rounds: roundsByCycle[cycle.id] || [],
        })
      ),
      activeCycleId,
    });
  } catch (err) {
    return respondWithServerError(res, err, "listCycles");
  }
};

exports.getActiveCycle = async (req, res) => {
  try {
    const payload = await buildActiveCyclePayload();
    return res.json(payload);
  } catch (err) {
    return respondWithServerError(res, err, "getActiveCycle");
  }
};

exports.createCycle = async (req, res) => {
  const name = String(req.body?.name || "").trim();
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  try {
    const slug = await ensureUniqueSlug(slugify(name));

    const { data: cycle, error: cycleError } = await supabase
      .from("cycles")
      .insert({ name, slug, status: "draft" })
      .select("*")
      .single();

    if (cycleError) return respondWithServerError(res, cycleError, "createCycle insert");

    const { data: rounds, error: roundsError } = await supabase
      .from("rounds")
      .insert(
        DEFAULT_CYCLE_ROUNDS.map((round) => ({
          cycle_id: cycle.id,
          name: round.name,
          type: round.type,
          status: "draft",
          sort_order: round.sortOrder,
          ...(round.type === ROUND_TYPES.RESUME_SCREEN
            ? { rubric_config: DEFAULT_RUBRIC_CONFIG }
            : {}),
        }))
      )
      .select("*");

    if (roundsError) return respondWithServerError(res, roundsError, "createCycle rounds");

    return res.status(201).json({
      cycle: mapCycle(cycle, {
        isActive: false,
        counts: { candidates: 0, resumes: 0, reviews: 0 },
        rounds: (rounds || []).map(mapRound),
      }),
    });
  } catch (err) {
    return respondWithServerError(res, err, "createCycle");
  }
};

exports.patchCycle = async (req, res) => {
  const cycleId = String(req.params.cycleId || "").trim();
  if (!cycleId) {
    return res.status(400).json({ error: "cycleId is required" });
  }

  const updates = {};
  if (typeof req.body?.name === "string" && req.body.name.trim()) {
    updates.name = req.body.name.trim();
  }
  if (typeof req.body?.status === "string" && CYCLE_STATUSES.has(req.body.status)) {
    updates.status = req.body.status;
  }
  if (req.body?.startsAt !== undefined) {
    updates.starts_at = req.body.startsAt || null;
  }
  if (req.body?.endsAt !== undefined) {
    updates.ends_at = req.body.endsAt || null;
  }
  if (req.body?.formUrl !== undefined || req.body?.googleFormId !== undefined) {
    const raw = req.body.formUrl ?? req.body.googleFormId ?? "";
    if (raw === null || raw === "") {
      updates.google_form_id = null;
    } else {
      const formId = parseGoogleFormId(raw);
      if (!formId) {
        return res.status(400).json({
          error: "Invalid Google Form URL or ID. Use the form edit URL (docs.google.com/forms/d/.../edit).",
        });
      }
      updates.google_form_id = formId;
    }
  }
  if (req.body?.fieldMap !== undefined) {
    const fieldMapError = validateFieldMap(req.body.fieldMap);
    if (fieldMapError) {
      return res.status(400).json({ error: fieldMapError });
    }
    updates.form_field_map = req.body.fieldMap;
  }
  if (req.body?.resumeQuestionId !== undefined) {
    updates.form_resume_question_id = req.body.resumeQuestionId || null;
  }
  if (req.body?.headshotQuestionId !== undefined) {
    updates.form_headshot_question_id = req.body.headshotQuestionId || null;
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  try {
    if (updates.status === "active") {
      const { data: target, error: targetError } = await supabase
        .from("cycles")
        .select("id")
        .eq("id", cycleId)
        .maybeSingle();

      if (targetError) return respondWithServerError(res, targetError, "patchCycle target");
      if (!target) return res.status(404).json({ error: "Cycle not found" });

      await applyActiveCycleSwitch(cycleId);
    }

    const { data, error } = await supabase
      .from("cycles")
      .update(updates)
      .eq("id", cycleId)
      .select("*")
      .maybeSingle();

    if (error) return respondWithServerError(res, error, "patchCycle update");
    if (!data) return res.status(404).json({ error: "Cycle not found" });

    if (updates.status === "archived") {
      const { error: closeRoundsError } = await supabase
        .from("rounds")
        .update({ status: "closed" })
        .eq("cycle_id", cycleId)
        .in("status", ["active", "draft"]);

      if (closeRoundsError) return respondWithServerError(res, closeRoundsError, "patchCycle close rounds");
    }

    const activeCycleId = await getActiveCycleId();
    const roundsByCycle = await fetchRoundsForCycles([cycleId]);
    const countsByCycle = await fetchCycleCounts([cycleId]);

    return res.json({
      cycle: mapCycle(data, {
        isActive: data.id === activeCycleId,
        counts: countsByCycle[cycleId] || { candidates: 0, resumes: 0, reviews: 0 },
        rounds: roundsByCycle[cycleId] || [],
      }),
    });
  } catch (err) {
    return respondWithServerError(res, err, "patchCycle");
  }
};

exports.activateCycle = async (req, res) => {
  const cycleId = String(req.params.cycleId || "").trim();
  if (!cycleId) {
    return res.status(400).json({ error: "cycleId is required" });
  }

  try {
    const { data: target, error: targetError } = await supabase
      .from("cycles")
      .select("*")
      .eq("id", cycleId)
      .maybeSingle();

    if (targetError) return respondWithServerError(res, targetError, "activateCycle target");
    if (!target) return res.status(404).json({ error: "Cycle not found" });

    await applyActiveCycleSwitch(cycleId);

    const { error: activateError } = await supabase
      .from("cycles")
      .update({ status: "active" })
      .eq("id", cycleId);

    if (activateError) return respondWithServerError(res, activateError, "activateCycle update");

    const payload = await buildActiveCyclePayload();
    return res.json(payload);
  } catch (err) {
    return respondWithServerError(res, err, "activateCycle");
  }
};

exports.patchRound = async (req, res) => {
  const roundId = String(req.params.roundId || "").trim();
  if (!roundId) {
    return res.status(400).json({ error: "roundId is required" });
  }

  const updates = {};
  if (typeof req.body?.name === "string" && req.body.name.trim()) {
    updates.name = req.body.name.trim();
  }
  if (typeof req.body?.status === "string" && ROUND_STATUSES.has(req.body.status)) {
    updates.status = req.body.status;
  }
  if (req.body?.rubricConfig !== undefined) {
    const validationError = validateRubricConfig(req.body.rubricConfig);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
    updates.rubric_config = req.body.rubricConfig;
  }
  if (req.body?.autoAdvancePercent !== undefined || req.body?.autoRejectPercent !== undefined) {
    const advancePercent = req.body?.autoAdvancePercent === undefined
      ? undefined
      : Number(req.body.autoAdvancePercent);
    const rejectPercent = req.body?.autoRejectPercent === undefined
      ? undefined
      : Number(req.body.autoRejectPercent);
    if ((advancePercent !== undefined && (!Number.isFinite(advancePercent) || advancePercent < 0 || advancePercent > 100))
      || (rejectPercent !== undefined && (!Number.isFinite(rejectPercent) || rejectPercent < 0 || rejectPercent > 100))) {
      return res.status(400).json({ error: "Automatic decision percentages must be between 0 and 100" });
    }

    const { data: existing, error: existingError } = await supabase
      .from("rounds")
      .select("auto_advance_percent, auto_reject_percent")
      .eq("id", roundId)
      .maybeSingle();
    if (existingError) return respondWithServerError(res, existingError, "patchRound percentages");
    if (!existing) return res.status(404).json({ error: "Round not found" });

    const nextAdvance = advancePercent === undefined ? Number(existing.auto_advance_percent) || 0 : advancePercent;
    const nextReject = rejectPercent === undefined ? Number(existing.auto_reject_percent) || 0 : rejectPercent;
    if (nextAdvance + nextReject > 100) {
      return res.status(400).json({ error: "Automatic advance and reject percentages cannot total more than 100" });
    }
    if (advancePercent !== undefined) updates.auto_advance_percent = advancePercent;
    if (rejectPercent !== undefined) updates.auto_reject_percent = rejectPercent;
  }

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  try {
    const { data, error } = await supabase
      .from("rounds")
      .update(updates)
      .eq("id", roundId)
      .select("*")
      .maybeSingle();

    if (error) return respondWithServerError(res, error, "patchRound");
    if (!data) return res.status(404).json({ error: "Round not found" });

    return res.json({ round: mapRound(data) });
  } catch (err) {
    return respondWithServerError(res, err, "patchRound");
  }
};

exports.activateRound = async (req, res) => {
  const roundId = String(req.params.roundId || "").trim();
  if (!roundId) {
    return res.status(400).json({ error: "roundId is required" });
  }

  try {
    const { data: target, error: targetError } = await supabase
      .from("rounds")
      .select("*")
      .eq("id", roundId)
      .maybeSingle();

    if (targetError) return respondWithServerError(res, targetError, "activateRound target");
    if (!target) return res.status(404).json({ error: "Round not found" });
    if (!isKnownRoundType(target.type)) {
      return res.status(400).json({ error: "Invalid round type" });
    }

    const { error: activationError } = await supabase.rpc("activate_round", { p_round_id: roundId });
    if (activationError) return respondWithServerError(res, activationError, "activateRound transaction");
    const { data, error } = await supabase.from("rounds").select("*").eq("id", roundId).single();

    if (error) return respondWithServerError(res, error, "activateRound update");

    return res.json({ round: mapRound(data) });
  } catch (err) {
    return respondWithServerError(res, err, "activateRound");
  }
};

exports.discoverCycleFormFields = async (req, res) => {
  const cycleId = String(req.params.cycleId || "").trim();
  if (!cycleId) {
    return res.status(400).json({ error: "cycleId is required" });
  }
  if (!isGoogleFormsConfigured()) {
    return res.status(503).json({
      error: "Google Forms sync is not configured. Set GOOGLE_CLOUD_KEY_PATH on the server.",
    });
  }

  try {
    const { data: cycle, error: cycleError } = await supabase
      .from("cycles")
      .select("id, google_form_id")
      .eq("id", cycleId)
      .maybeSingle();

    if (cycleError) return respondWithServerError(res, cycleError, "discoverCycleFormFields");
    if (!cycle) return res.status(404).json({ error: "Cycle not found" });

    const formInput = req.body?.formUrl ?? req.body?.googleFormId ?? cycle.google_form_id;
    const formId = parseGoogleFormId(formInput);
    if (!formId) {
      return res.status(400).json({
        error: "Provide a Google Form edit URL or save one on this cycle first.",
      });
    }

    const discovered = await discoverFormQuestions(formId);
    const suggestedFieldMap = buildSuggestedFieldMap(discovered.questions);
    const { resumeQuestionId, headshotQuestionId } = inferFileQuestionIds(
      discovered.questions,
      suggestedFieldMap
    );

    return res.json({
      formId: discovered.formId,
      formTitle: discovered.formTitle,
      questions: discovered.questions,
      suggestedFieldMap,
      resumeQuestionId: resumeQuestionId || null,
      headshotQuestionId: headshotQuestionId || null,
      candidateColumns: CANDIDATE_COLUMNS,
    });
  } catch (err) {
    return respondWithServerError(res, err, "discoverCycleFormFields", "Could not discover form fields");
  }
};

exports.syncCycleForm = async (req, res) => {
  const cycleId = String(req.params.cycleId || "").trim();
  if (!cycleId) {
    return res.status(400).json({ error: "cycleId is required" });
  }
  if (!isGoogleFormsConfigured()) {
    return res.status(503).json({
      error: "Google Forms sync is not configured. Set GOOGLE_CLOUD_KEY_PATH on the server.",
    });
  }

  try {
    const { data: cycle, error: cycleError } = await supabase
      .from("cycles")
      .select("id, google_form_id, form_field_map")
      .eq("id", cycleId)
      .maybeSingle();

    if (cycleError) return respondWithServerError(res, cycleError, "syncCycleForm");
    if (!cycle) return res.status(404).json({ error: "Cycle not found" });
    if (!cycle.google_form_id || !cycle.form_field_map) {
      return res.status(400).json({ error: "Save a Google Form URL and field map on this cycle first" });
    }

    const result = await syncFormResponsesToDatabase(cycleId);
    const activeCycleId = await getActiveCycleId();
    const roundsByCycle = await fetchRoundsForCycles([cycleId]);
    const countsByCycle = await fetchCycleCounts([cycleId]);

    const { data: refreshed, error: refreshError } = await supabase
      .from("cycles")
      .select("*")
      .eq("id", cycleId)
      .maybeSingle();

    if (refreshError) return respondWithServerError(res, refreshError, "syncCycleForm refresh");

    return res.json({
      processed: result.processed,
      errors: result.errors,
      cycle: mapCycle(refreshed, {
        isActive: refreshed.id === activeCycleId,
        counts: countsByCycle[cycleId] || { candidates: 0, resumes: 0, reviews: 0 },
        rounds: roundsByCycle[cycleId] || [],
      }),
    });
  } catch (err) {
    if (err.code === "SYNC_IN_PROGRESS") {
      return res.status(409).json({ error: err.message });
    }
    return respondWithServerError(res, err, "syncCycleForm", "Form sync failed");
  }
};

exports.closeRound = async (req, res) => {
  const roundId = String(req.params.roundId || "").trim();
  if (!roundId) {
    return res.status(400).json({ error: "roundId is required" });
  }

  try {
    const { data: current, error: currentError } = await supabase
      .from("rounds")
      .select("id, cycle_id, status")
      .eq("id", roundId)
      .maybeSingle();
    if (currentError) return respondWithServerError(res, currentError, "closeRound current");
    if (!current) return res.status(404).json({ error: "Round not found" });

    if (current.status === "active") {
      const deliberationError = await assertDeliberationCompleteForRound(current.cycle_id, roundId);
      if (deliberationError) {
        return res.status(deliberationError.status).json(deliberationError);
      }
    }

    const { data, error } = await supabase
      .from("rounds")
      .update({ status: "closed" })
      .eq("id", roundId)
      .select("*")
      .maybeSingle();

    if (error) return respondWithServerError(res, error, "closeRound");
    if (!data) return res.status(404).json({ error: "Round not found" });

    return res.json({ round: mapRound(data) });
  } catch (err) {
    return respondWithServerError(res, err, "closeRound");
  }
};

/** Close the active round and activate the next round in the same cycle (by sort_order). */
exports.advanceToNextRound = async (req, res) => {
  const roundId = String(req.params.roundId || "").trim();
  if (!roundId) {
    return res.status(400).json({ error: "roundId is required" });
  }

  try {
    const { data: current, error: currentError } = await supabase
      .from("rounds")
      .select("*")
      .eq("id", roundId)
      .maybeSingle();

    if (currentError) return respondWithServerError(res, currentError, "advanceToNextRound current");
    if (!current) return res.status(404).json({ error: "Round not found" });
    if (current.status !== "active") {
      return res.status(400).json({ error: "Only the active round can be advanced" });
    }

    const deliberationError = await assertDeliberationCompleteForRound(current.cycle_id, roundId);
    if (deliberationError) {
      return res.status(deliberationError.status).json({
        error: deliberationError.error,
        incompleteCount: deliberationError.incompleteCount,
        pendingCount: deliberationError.pendingCount,
        holdCount: deliberationError.holdCount,
        underReviewedCount: deliberationError.underReviewedCount,
      });
    }

    const { data: nextRoundId, error: advanceError } = await supabase.rpc("advance_round", { p_round_id: roundId });
    if (advanceError) return respondWithServerError(res, advanceError, "advanceToNextRound transaction");
    const { data: nextRound, error: nextError } = nextRoundId
      ? await supabase.from("rounds").select("*").eq("id", nextRoundId).maybeSingle()
      : { data: null, error: null };
    if (nextError) return respondWithServerError(res, nextError, "advanceToNextRound next");
    if (!nextRound) {
      return res.json({
        closedRound: mapRound({ ...current, status: "closed" }),
        activatedRound: null,
        message: "Round closed. There is no next round in this cycle.",
      });
    }

    return res.json({
      closedRound: mapRound({ ...current, status: "closed" }),
      activatedRound: mapRound(nextRound),
    });
  } catch (err) {
    return respondWithServerError(res, err, "advanceToNextRound");
  }
};
