const supabase = require("../config/supabase");
const {
  getActiveCycleRow,
  getRoundById,
  getRoundsForCycle,
} = require("../utils/cycleContext");
const { validateRubricConfig } = require("../utils/rubric");
const { summarizeIncompleteDeliberation } = require("../utils/roundDecisions");
const { isMissingSchemaError } = require("../utils/schemaCompatibility");
const { loadDeliberationPoolForRound } = require("./roundDeliberationService");
const {
  ROUND_TYPES,
  getRoundByType,
  getPriorRound,
  normalizeRoundType,
} = require("../utils/rounds");
const {
  ROUND_PHASES,
  getRoundPhase,
  isOpenPhase,
  normalizeRoundPhase,
  evaluateTransition,
} = require("../utils/roundPhases");

async function countPriorAdvances(cycleId, priorRound) {
  if (!priorRound) return 0;

  const { data, error } = await supabase
    .from("round_decisions")
    .select("candidate_id")
    .eq("cycle_id", cycleId)
    .eq("round_id", priorRound.id)
    .eq("decision", "advance");

  if (error) throw error;
  return (data || []).length;
}

async function countTableAssignments(round) {
  const { data, error } = await supabase
    .from("interview_group_assignments")
    .select("candidate_id")
    .eq("round_id", round.id);

  if (error) {
    // Coffee Chat tables need migration #26. Without it the round cannot be
    // graded at all, so report it as unassigned rather than waving it through.
    if (isMissingSchemaError(error)) return 0;
    throw error;
  }
  return (data || []).length;
}

/** Review coverage and committee progress, both read off the same pool. */
async function loadPoolSignals(cycleId, round, rounds) {
  const resumeRound = getRoundByType(rounds, ROUND_TYPES.RESUME_SCREEN);
  if (!resumeRound) {
    return { error: "No resume screening round for this cycle", status: 400 };
  }

  const pool = await loadDeliberationPoolForRound(cycleId, round, resumeRound, rounds);
  return {
    awaitingReviews: pool.filter((c) => c.numReviews === 0 && !c.screeningExclusionReason).length,
    deliberation: summarizeIncompleteDeliberation(pool),
  };
}

/** Only gathers what the target phase's guards actually read. */
async function buildTransitionContext(cycle, round, targetPhase, rounds) {
  if (targetPhase === ROUND_PHASES.GRADING) {
    const priorRound = getPriorRound(rounds, round);
    const context = {
      rubricValid: Boolean(round.rubric_config) && !validateRubricConfig(round.rubric_config),
      priorRound,
      priorAdvanceCount: await countPriorAdvances(cycle.id, priorRound),
    };
    if (normalizeRoundType(round.type) === ROUND_TYPES.COFFEE_CHAT) {
      context.tableAssignmentCount = await countTableAssignments(round);
    }
    return context;
  }

  if (targetPhase === ROUND_PHASES.DELIBERATION || targetPhase === ROUND_PHASES.CLOSED) {
    return loadPoolSignals(cycle.id, round, rounds);
  }

  return {};
}

/**
 * The one place a round's phase changes. Every entry point goes through here so
 * no path can skip a guard the way close-round used to skip the committee check.
 */
async function transitionRoundToPhase({ roundId, targetPhase, confirmed = false, userId = null }) {
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

  const to = normalizeRoundPhase(targetPhase);
  const rounds = await getRoundsForCycle(cycle.id);

  // A partial unique index enforces one open round per cycle. Report the
  // conflict by name instead of letting the write fail on a duplicate key.
  // Collected rather than returned early, so a setup checklist can show every
  // problem at once instead of revealing them one retry at a time.
  const conflictBlockers = [];
  if (isOpenPhase(to)) {
    const conflict = rounds.find((other) => other.id !== round.id && isOpenPhase(getRoundPhase(other)));
    const priorRound = getPriorRound(rounds, round);
    // When the open round is this round's predecessor, the prior-round guard
    // already says so in more useful words. Don't report it twice.
    if (conflict && conflict.id !== priorRound?.id) {
      conflictBlockers.push({
        code: "another_round_open",
        message: `${conflict.name} is still open. Close it before opening ${round.name}.`,
      });
    }
  }

  const context = await buildTransitionContext(cycle, round, to, rounds);
  if (context.error) return context;

  const evaluation = evaluateTransition(round, to, { ...context, confirmed });
  const blockers = [...conflictBlockers, ...evaluation.blockers];

  if (!evaluation.ok || blockers.length) {
    const reason = blockers[0] || evaluation.warnings[0];
    return {
      error: reason?.message || "Cannot change this round's phase.",
      status: 400,
      blockers,
      warnings: evaluation.warnings,
      requiresConfirmation: evaluation.requiresConfirmation,
    };
  }

  const { data, error } = await supabase
    .from("rounds")
    .update({
      status: to,
      status_changed_at: new Date().toISOString(),
      status_changed_by: userId,
    })
    .eq("id", round.id)
    .select("*")
    .single();

  if (error) throw error;

  return { cycle, round: data, from: evaluation.from, to };
}

module.exports = {
  buildTransitionContext,
  transitionRoundToPhase,
};
