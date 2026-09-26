const supabase = require("../config/supabase");
const {
  ROUND_TYPES,
  getRoundByType,
  isInterviewRoundType,
  formatRoundKind,
} = require("./rounds");
const {
  ROUND_PHASES,
  OPEN_PHASES,
  getRoundPhase,
  formatRoundPhase,
  isOpenPhase,
  isClosedPhase,
  canRecordGrades,
  getOpenPhasesForQuery,
} = require("./roundPhases");

async function getActiveCycleId(client = supabase) {
  const { data, error } = await client
    .from("app_settings")
    .select("active_cycle_id")
    .eq("id", 1)
    .maybeSingle();

  if (error) throw error;
  return data?.active_cycle_id || null;
}

async function getActiveCycleRow() {
  const cycleId = await getActiveCycleId();
  if (!cycleId) return null;

  const { data, error } = await supabase
    .from("cycles")
    .select("*")
    .eq("id", cycleId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getOpenResumeRound() {
  const cycleId = await getActiveCycleId();
  if (!cycleId) return null;

  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("type", "resume_screen")
    .in("status", getOpenPhasesForQuery())
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getResumeScreenRoundForCycle(cycleId) {
  if (!cycleId) return null;

  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("cycle_id", cycleId)
    .eq("type", "resume_screen")
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function getOpenInterviewRound() {
  const cycleId = await getActiveCycleId();
  if (!cycleId) return null;

  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("cycle_id", cycleId)
    .in("status", getOpenPhasesForQuery())
    .maybeSingle();

  if (error) throw error;
  if (!data || !isInterviewRoundType(data.type)) return null;
  return data;
}

async function getInterviewRoundForCycle(cycleId, roundType = ROUND_TYPES.COFFEE_CHAT) {
  if (!cycleId) return null;

  const { data: rounds, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return getRoundByType(rounds, roundType);
}

async function getRoundsForCycle(cycleId) {
  if (!cycleId) return [];

  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("cycle_id", cycleId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function getOpenRoundForCycle(cycleId) {
  if (!cycleId) return null;

  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("cycle_id", cycleId)
    .in("status", getOpenPhasesForQuery())
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * The round the cycle is working on. Prefers the open round, but falls back to
 * the earliest round that is not yet closed so a round sitting in setup — with
 * nothing open anywhere in the cycle — still resolves.
 */
async function getCurrentRoundForCycle(cycleId) {
  const rounds = await getRoundsForCycle(cycleId);
  const open = rounds.find((round) => isOpenPhase(getRoundPhase(round)));
  if (open) return open;
  return rounds.find((round) => !isClosedPhase(getRoundPhase(round))) || null;
}

async function getRoundById(roundId) {
  if (!roundId) return null;

  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("id", roundId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function describePhases(phases) {
  const labels = phases.map(formatRoundPhase);
  if (labels.length <= 1) return labels[0] || "";
  return `${labels.slice(0, -1).join(", ")} or ${labels[labels.length - 1]}`;
}

function roundPhaseError(round, allowedPhases) {
  const phase = getRoundPhase(round);
  if (allowedPhases.includes(phase)) return null;
  return {
    error: `${round.name} is in ${formatRoundPhase(phase)}. This action needs ${describePhases(allowedPhases)}.`,
    status: 400,
  };
}

/**
 * Resolve a round by identity rather than by "whichever one is open", then
 * assert its phase. Setup rounds are not open, so anything that has to work
 * before grading starts cannot be resolved by an open-round lookup.
 */
async function requireRoundById(roundId, allowedPhases) {
  const cycle = await getActiveCycleRow();
  if (!cycle) {
    return { error: "No active recruiting cycle", status: 503 };
  }

  const round = await getRoundById(roundId);
  if (!round) {
    return { error: "Round not found", status: 404 };
  }
  if (round.cycle_id !== cycle.id) {
    return { error: "That round belongs to a different cycle", status: 400 };
  }

  const phaseIssue = roundPhaseError(round, allowedPhases);
  if (phaseIssue) return phaseIssue;

  return { cycle, round };
}

/** Same, by round type within the active cycle, for routes that carry no round id. */
async function requireRoundByType(roundType, allowedPhases) {
  const cycle = await getActiveCycleRow();
  if (!cycle) {
    return { error: "No active recruiting cycle", status: 503 };
  }

  const rounds = await getRoundsForCycle(cycle.id);
  const round = getRoundByType(rounds, roundType);
  if (!round) {
    return { error: `This cycle has no ${formatRoundKind(roundType).toLowerCase()} round`, status: 503 };
  }

  const phaseIssue = roundPhaseError(round, allowedPhases);
  if (phaseIssue) return phaseIssue;

  return { cycle, round };
}

/** Reads that serve the grading workflow but must survive the deliberation freeze. */
async function requireOpenResumeRound() {
  return requireRoundByType(ROUND_TYPES.RESUME_SCREEN, OPEN_PHASES);
}

/** Score writes. Deliberation freezes the scoreboard the committee is ranking. */
async function requireResumeGradingPhase() {
  return requireRoundByType(ROUND_TYPES.RESUME_SCREEN, [ROUND_PHASES.GRADING]);
}

/**
 * Coffee chat and final round share one slot, so this resolves whichever of
 * them is open rather than asking for a type.
 */
async function requireOpenInterviewRound() {
  const cycle = await getActiveCycleRow();
  if (!cycle) {
    return { error: "No active recruiting cycle", status: 503 };
  }

  const round = await getOpenInterviewRound();
  if (!round) {
    return { error: "No coffee chat or final round is open", status: 503 };
  }

  return { cycle, round };
}

async function requireInterviewGradingPhase() {
  const ctx = await requireOpenInterviewRound();
  if (ctx.error) return ctx;
  if (!canRecordGrades(getRoundPhase(ctx.round))) {
    return {
      error: `${ctx.round.name} is in ${formatRoundPhase(getRoundPhase(ctx.round))}. Grading is closed for this round.`,
      status: 400,
    };
  }
  return ctx;
}

module.exports = {
  getActiveCycleId,
  getActiveCycleRow,
  getOpenResumeRound,
  getResumeScreenRoundForCycle,
  getOpenInterviewRound,
  getInterviewRoundForCycle,
  getRoundsForCycle,
  getOpenRoundForCycle,
  getCurrentRoundForCycle,
  getRoundById,
  requireRoundById,
  requireRoundByType,
  requireOpenResumeRound,
  requireResumeGradingPhase,
  requireOpenInterviewRound,
  requireInterviewGradingPhase,
};
