const {
  ROUND_TYPES,
  normalizeRoundType,
  isResumeScreenType,
  isInterviewRoundType,
} = require("./rounds");

const ROUND_PHASES = Object.freeze({
  SETUP: "setup",
  GRADING: "grading",
  DELIBERATION: "deliberation",
  CLOSED: "closed",
});

// rounds.status held these before add_round_phases.sql split 'active' into
// grading and deliberation. Kept so un-migrated rows and cached client
// payloads still resolve to a phase instead of falling through as unknown.
const LEGACY_PHASE_ALIASES = Object.freeze({
  draft: ROUND_PHASES.SETUP,
  active: ROUND_PHASES.GRADING,
});

/** Forward order. A round may only advance one step at a time, so no guard is skipped. */
const PHASE_ORDER = Object.freeze([
  ROUND_PHASES.SETUP,
  ROUND_PHASES.GRADING,
  ROUND_PHASES.DELIBERATION,
  ROUND_PHASES.CLOSED,
]);

/** Phases where this round is the one the cycle is working on. Replaces the old status === 'active'. */
const OPEN_PHASES = Object.freeze([ROUND_PHASES.GRADING, ROUND_PHASES.DELIBERATION]);

const PHASE_SET = new Set(PHASE_ORDER);

const PHASE_LABELS = Object.freeze({
  [ROUND_PHASES.SETUP]: "Setup",
  [ROUND_PHASES.GRADING]: "Grading",
  [ROUND_PHASES.DELIBERATION]: "Deliberation",
  [ROUND_PHASES.CLOSED]: "Closed",
});

/** Unknown values pass through rather than defaulting, so they fail every permission check below. */
function normalizeRoundPhase(value) {
  const normalized = String(value == null ? "" : value).trim().toLowerCase();
  return LEGACY_PHASE_ALIASES[normalized] || normalized;
}

function getRoundPhase(round) {
  return normalizeRoundPhase(round?.status);
}

function isKnownRoundPhase(value) {
  return PHASE_SET.has(normalizeRoundPhase(value));
}

function isSetupPhase(value) {
  return normalizeRoundPhase(value) === ROUND_PHASES.SETUP;
}

function isGradingPhase(value) {
  return normalizeRoundPhase(value) === ROUND_PHASES.GRADING;
}

function isDeliberationPhase(value) {
  return normalizeRoundPhase(value) === ROUND_PHASES.DELIBERATION;
}

function isClosedPhase(value) {
  return normalizeRoundPhase(value) === ROUND_PHASES.CLOSED;
}

function isOpenPhase(value) {
  return OPEN_PHASES.includes(normalizeRoundPhase(value));
}

/** Graders may submit scores. Deliberation freezes the scoreboard the committee is ranking. */
function canRecordGrades(value) {
  return isGradingPhase(value);
}

function canRecordDecisions(value) {
  return isDeliberationPhase(value);
}

/** Coffee Chat table splits and moves, allowed until scores freeze for deliberation. */
const TABLE_PHASES = Object.freeze([ROUND_PHASES.SETUP, ROUND_PHASES.GRADING]);

function canManageTables(value) {
  return TABLE_PHASES.includes(normalizeRoundPhase(value));
}

/** Rubric, auto-decision cutoffs, and the Coffee Chat table split. */
function canEditSetup(value) {
  return isSetupPhase(value);
}

function formatRoundPhase(value) {
  return PHASE_LABELS[normalizeRoundPhase(value)] || "Unknown";
}

/**
 * Status values to match in a database query. Includes the pre-migration
 * 'active' so a read still finds the open round if the code deploys ahead of
 * add_round_phases.sql, mirroring getInterviewRoundTypesForQuery().
 */
function getOpenPhasesForQuery() {
  return [...OPEN_PHASES, "active"];
}

/** Every phase except closed, for queries that mean "still in play". */
function getUnclosedPhasesForQuery() {
  return [ROUND_PHASES.SETUP, ...OPEN_PHASES, "draft", "active"];
}

function phaseIndex(value) {
  return PHASE_ORDER.indexOf(normalizeRoundPhase(value));
}

function nextPhase(value) {
  const index = phaseIndex(value);
  if (index < 0) return null;
  return PHASE_ORDER[index + 1] || null;
}

function previousPhase(value) {
  const index = phaseIndex(value);
  if (index <= 0) return null;
  return PHASE_ORDER[index - 1];
}

function isForwardTransition(from, to) {
  const fromIndex = phaseIndex(from);
  const toIndex = phaseIndex(to);
  if (fromIndex < 0 || toIndex < 0) return false;
  return toIndex > fromIndex;
}

function isBackwardTransition(from, to) {
  const fromIndex = phaseIndex(from);
  const toIndex = phaseIndex(to);
  if (fromIndex < 0 || toIndex < 0) return false;
  return toIndex < fromIndex;
}

/**
 * Forward moves must be adjacent so every entry guard runs. Backward moves may
 * skip (reopening a closed round straight back to setup is a real recovery).
 */
function isAllowedTransition(from, to) {
  const fromIndex = phaseIndex(from);
  const toIndex = phaseIndex(to);
  if (fromIndex < 0 || toIndex < 0) return false;
  if (toIndex === fromIndex) return false;
  if (toIndex > fromIndex) return toIndex === fromIndex + 1;
  return true;
}

function gradingEntryBlockers(round, context) {
  const blockers = [];
  const type = normalizeRoundType(round?.type);

  if (isResumeScreenType(type) && !context.rubricValid) {
    blockers.push({
      code: "rubric_missing",
      message: "Configure the screening rubric before opening grading.",
    });
  }

  if (isInterviewRoundType(type)) {
    const priorRound = context.priorRound || null;
    const priorName = priorRound?.name || "the previous round";
    if (!priorRound || !isClosedPhase(getRoundPhase(priorRound))) {
      blockers.push({
        code: "prior_round_open",
        message: `Close ${priorName} before opening grading.`,
      });
    } else if (!(Number(context.priorAdvanceCount) > 0)) {
      // Only meaningful once the prior round is closed and its advances are final.
      blockers.push({
        code: "prior_round_no_advances",
        message: `No candidates advanced from ${priorName}, so this round has nobody to grade.`,
      });
    }
  }

  if (type === ROUND_TYPES.COFFEE_CHAT && !(Number(context.tableAssignmentCount) > 0)) {
    blockers.push({
      code: "tables_unassigned",
      message: "Split the advanced candidates into tables before opening grading.",
    });
  }

  return blockers;
}

function deliberationEntryWarnings(context) {
  const awaiting = Number(context.awaitingReviews) || 0;
  if (awaiting <= 0) return [];
  return [{
    code: "reviews_incomplete",
    message: `${awaiting} candidate(s) have no reviews yet. Confirm to deliberate without them.`,
    count: awaiting,
  }];
}

function closedEntryBlockers(context) {
  const summary = context.deliberation || {};
  const incompleteCount = Number(summary.incompleteCount) || 0;
  if (incompleteCount <= 0) return [];

  const pendingCount = Number(summary.pendingCount) || 0;
  const holdCount = Number(summary.holdCount) || 0;
  const parts = [];
  if (pendingCount) parts.push(`${pendingCount} pending`);
  if (holdCount) parts.push(`${holdCount} on hold`);
  const detail = parts.length ? ` (${parts.join(", ")})` : "";

  return [{
    code: "deliberation_incomplete",
    message: `${incompleteCount} candidate(s) still need Advance or Reject${detail}.`,
    incompleteCount,
    pendingCount,
    holdCount,
  }];
}

/**
 * Pure guard evaluation: callers gather the context from the database, this
 * decides. `ok` folds in the confirmation, so a controller only has to branch
 * once.
 *
 * context: { confirmed, rubricValid, priorRound, priorAdvanceCount,
 *            tableAssignmentCount, awaitingReviews,
 *            deliberation: { incompleteCount, pendingCount, holdCount } }
 */
function evaluateTransition(round, targetPhase, context = {}) {
  const from = getRoundPhase(round);
  const to = normalizeRoundPhase(targetPhase);

  if (!isKnownRoundPhase(to)) {
    return {
      from,
      to,
      ok: false,
      blockers: [{ code: "unknown_phase", message: `"${targetPhase}" is not a round phase.` }],
      warnings: [],
      requiresConfirmation: false,
    };
  }

  if (!isAllowedTransition(from, to)) {
    const message = from === to
      ? `This round is already in ${formatRoundPhase(to)}.`
      : `Cannot move from ${formatRoundPhase(from)} straight to ${formatRoundPhase(to)}.`;
    return {
      from,
      to,
      ok: false,
      blockers: [{ code: "invalid_transition", message }],
      warnings: [],
      requiresConfirmation: false,
    };
  }

  let blockers = [];
  let warnings = [];

  // Entry guards apply to forward moves only. Rolling back is a recovery path
  // and keeps every decision already recorded.
  if (isForwardTransition(from, to)) {
    if (to === ROUND_PHASES.GRADING) blockers = gradingEntryBlockers(round, context);
    if (to === ROUND_PHASES.DELIBERATION) warnings = deliberationEntryWarnings(context);
    if (to === ROUND_PHASES.CLOSED) blockers = closedEntryBlockers(context);
  }

  const requiresConfirmation = isBackwardTransition(from, to) || warnings.length > 0;
  const confirmed = context.confirmed === true;

  return {
    from,
    to,
    ok: blockers.length === 0 && (!requiresConfirmation || confirmed),
    blockers,
    warnings,
    requiresConfirmation,
  };
}

module.exports = {
  ROUND_PHASES,
  LEGACY_PHASE_ALIASES,
  PHASE_ORDER,
  OPEN_PHASES,
  TABLE_PHASES,
  PHASE_LABELS,
  normalizeRoundPhase,
  getRoundPhase,
  isKnownRoundPhase,
  isSetupPhase,
  isGradingPhase,
  isDeliberationPhase,
  isClosedPhase,
  isOpenPhase,
  canRecordGrades,
  canRecordDecisions,
  canManageTables,
  canEditSetup,
  formatRoundPhase,
  phaseIndex,
  nextPhase,
  previousPhase,
  isForwardTransition,
  isBackwardTransition,
  isAllowedTransition,
  getOpenPhasesForQuery,
  getUnclosedPhasesForQuery,
  evaluateTransition,
};
