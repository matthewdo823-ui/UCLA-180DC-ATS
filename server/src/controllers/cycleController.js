const supabase = require("../config/supabase");
const { DEFAULT_RUBRIC_CONFIG, validateRubricConfig } = require("../utils/rubric");

const CYCLE_STATUSES = new Set(["draft", "active", "archived"]);
const ROUND_STATUSES = new Set(["draft", "active", "closed"]);
const ROUND_TYPES = new Set(["resume_screen", "interview"]);

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
    ...extras,
  };
}

async function getActiveCycleId() {
  const { data, error } = await supabase
    .from("app_settings")
    .select("active_cycle_id")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;
  return data?.active_cycle_id || null;
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

    if (error) return res.status(500).json({ error: error.message });

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
    console.error("listCycles error:", err);
    return res.status(500).json({ error: err.message });
  }
};

exports.getActiveCycle = async (req, res) => {
  try {
    const payload = await buildActiveCyclePayload();
    return res.json(payload);
  } catch (err) {
    console.error("getActiveCycle error:", err);
    return res.status(500).json({ error: err.message });
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

    if (cycleError) return res.status(500).json({ error: cycleError.message });

    const { data: rounds, error: roundsError } = await supabase
      .from("rounds")
      .insert([
        {
          cycle_id: cycle.id,
          name: "Resume Screen",
          type: "resume_screen",
          status: "draft",
          sort_order: 1,
          rubric_config: DEFAULT_RUBRIC_CONFIG,
        },
        {
          cycle_id: cycle.id,
          name: "Interview Management",
          type: "interview",
          status: "draft",
          sort_order: 2,
        },
      ])
      .select("*");

    if (roundsError) return res.status(500).json({ error: roundsError.message });

    return res.status(201).json({
      cycle: mapCycle(cycle, {
        isActive: false,
        counts: { candidates: 0, resumes: 0, reviews: 0 },
        rounds: (rounds || []).map(mapRound),
      }),
    });
  } catch (err) {
    console.error("createCycle error:", err);
    return res.status(500).json({ error: err.message });
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

  if (!Object.keys(updates).length) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  try {
    const { data, error } = await supabase
      .from("cycles")
      .update(updates)
      .eq("id", cycleId)
      .select("*")
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Cycle not found" });

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
    console.error("patchCycle error:", err);
    return res.status(500).json({ error: err.message });
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

    if (targetError) return res.status(500).json({ error: targetError.message });
    if (!target) return res.status(404).json({ error: "Cycle not found" });

    const { error: archiveError } = await supabase
      .from("cycles")
      .update({ status: "archived" })
      .neq("id", cycleId)
      .eq("status", "active");

    if (archiveError) return res.status(500).json({ error: archiveError.message });

    const { error: activateError } = await supabase
      .from("cycles")
      .update({ status: "active" })
      .eq("id", cycleId);

    if (activateError) return res.status(500).json({ error: activateError.message });

    const { error: settingsError } = await supabase
      .from("app_settings")
      .upsert({ id: 1, active_cycle_id: cycleId }, { onConflict: "id" });

    if (settingsError) return res.status(500).json({ error: settingsError.message });

    const payload = await buildActiveCyclePayload();
    return res.json(payload);
  } catch (err) {
    console.error("activateCycle error:", err);
    return res.status(500).json({ error: err.message });
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

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Round not found" });

    return res.json({ round: mapRound(data) });
  } catch (err) {
    console.error("patchRound error:", err);
    return res.status(500).json({ error: err.message });
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

    if (targetError) return res.status(500).json({ error: targetError.message });
    if (!target) return res.status(404).json({ error: "Round not found" });
    if (!ROUND_TYPES.has(target.type)) {
      return res.status(400).json({ error: "Invalid round type" });
    }

    const { error: closeOthersError } = await supabase
      .from("rounds")
      .update({ status: "closed" })
      .eq("cycle_id", target.cycle_id)
      .eq("status", "active")
      .neq("id", roundId);

    if (closeOthersError) return res.status(500).json({ error: closeOthersError.message });

    const { data, error } = await supabase
      .from("rounds")
      .update({ status: "active" })
      .eq("id", roundId)
      .select("*")
      .single();

    if (error) return res.status(500).json({ error: error.message });

    return res.json({ round: mapRound(data) });
  } catch (err) {
    console.error("activateRound error:", err);
    return res.status(500).json({ error: err.message });
  }
};

exports.closeRound = async (req, res) => {
  const roundId = String(req.params.roundId || "").trim();
  if (!roundId) {
    return res.status(400).json({ error: "roundId is required" });
  }

  try {
    const { data, error } = await supabase
      .from("rounds")
      .update({ status: "closed" })
      .eq("id", roundId)
      .select("*")
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: "Round not found" });

    return res.json({ round: mapRound(data) });
  } catch (err) {
    console.error("closeRound error:", err);
    return res.status(500).json({ error: err.message });
  }
};
