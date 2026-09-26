export const ROUND_PHASES = Object.freeze({
  SETUP: "setup",
  GRADING: "grading",
  DELIBERATION: "deliberation",
  CLOSED: "closed",
});

// rounds.status held these before per-round phases existed. Kept so a cached
// /cycles/active payload from before the rollout still renders a phase.
const LEGACY_PHASE_ALIASES = Object.freeze({
  draft: ROUND_PHASES.SETUP,
  active: ROUND_PHASES.GRADING,
});

export const PHASE_ORDER = Object.freeze([
  ROUND_PHASES.SETUP,
  ROUND_PHASES.GRADING,
  ROUND_PHASES.DELIBERATION,
  ROUND_PHASES.CLOSED,
]);

export const OPEN_PHASES = Object.freeze([ROUND_PHASES.GRADING, ROUND_PHASES.DELIBERATION]);

export const PHASE_LABELS = Object.freeze({
  [ROUND_PHASES.SETUP]: "Setup",
  [ROUND_PHASES.GRADING]: "Grading",
  [ROUND_PHASES.DELIBERATION]: "Deliberation",
  [ROUND_PHASES.CLOSED]: "Closed",
});

/** What each phase unlocks, for the Cycle Management stepper. */
export const PHASE_DESCRIPTIONS = Object.freeze({
  [ROUND_PHASES.SETUP]: "Configure the rubric, cutoffs, and tables. Grading and decisions are closed.",
  [ROUND_PHASES.GRADING]: "Graders submit scores. Committee decisions are locked.",
  [ROUND_PHASES.DELIBERATION]: "Scores are frozen. The committee advances or rejects each candidate.",
  [ROUND_PHASES.CLOSED]: "Decisions are final and advance emails can go out.",
});

export const ROUND_PHASE_STYLE = Object.freeze({
  [ROUND_PHASES.SETUP]: { bg: "rgba(239,159,39,0.12)", color: "#C47D12", bd: "rgba(239,159,39,0.28)" },
  [ROUND_PHASES.GRADING]: { bg: "rgba(29,158,117,0.12)", color: "#1D9E75", bd: "rgba(29,158,117,0.28)" },
  [ROUND_PHASES.DELIBERATION]: { bg: "rgba(59,130,246,0.12)", color: "#2563EB", bd: "rgba(59,130,246,0.28)" },
  [ROUND_PHASES.CLOSED]: { bg: "rgba(107,114,128,0.12)", color: "#6B7280", bd: "rgba(107,114,128,0.28)" },
});

/** Unknown values pass through rather than defaulting, so they fail every check below. */
export function normalizeRoundPhase(value) {
  const normalized = String(value == null ? "" : value).trim().toLowerCase();
  return LEGACY_PHASE_ALIASES[normalized] || normalized;
}

export function getRoundPhase(round) {
  return normalizeRoundPhase(round?.status);
}

export function isSetupPhase(value) {
  return normalizeRoundPhase(value) === ROUND_PHASES.SETUP;
}

export function isGradingPhase(value) {
  return normalizeRoundPhase(value) === ROUND_PHASES.GRADING;
}

export function isDeliberationPhase(value) {
  return normalizeRoundPhase(value) === ROUND_PHASES.DELIBERATION;
}

export function isClosedPhase(value) {
  return normalizeRoundPhase(value) === ROUND_PHASES.CLOSED;
}

export function isOpenPhase(value) {
  return OPEN_PHASES.includes(normalizeRoundPhase(value));
}

export function canRecordGrades(value) {
  return isGradingPhase(value);
}

export function canRecordDecisions(value) {
  return isDeliberationPhase(value);
}

/** Coffee Chat table splits and moves, allowed until scores freeze for deliberation. */
export const TABLE_PHASES = Object.freeze([ROUND_PHASES.SETUP, ROUND_PHASES.GRADING]);

export function canManageTables(value) {
  return TABLE_PHASES.includes(normalizeRoundPhase(value));
}

export function canEditSetup(value) {
  return isSetupPhase(value);
}

export function formatRoundPhase(value) {
  return PHASE_LABELS[normalizeRoundPhase(value)] || "Unknown";
}

export function phaseIndex(value) {
  return PHASE_ORDER.indexOf(normalizeRoundPhase(value));
}
