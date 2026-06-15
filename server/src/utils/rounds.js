const ROUND_TYPES = Object.freeze({
  RESUME_SCREEN: "resume_screen",
  COFFEE_CHAT: "coffee_chat",
  FINAL_ROUND: "final_round",
});

const LEGACY_INTERVIEW_TYPE = "interview";

const ROUND_TYPE_SET = new Set(Object.values(ROUND_TYPES));

const DEFAULT_ROUND_NAMES = Object.freeze({
  [ROUND_TYPES.RESUME_SCREEN]: "Resume Screen",
  [ROUND_TYPES.COFFEE_CHAT]: "Coffee Chats",
  [ROUND_TYPES.FINAL_ROUND]: "Final Round",
});

const ROUND_KIND_LABELS = Object.freeze({
  [ROUND_TYPES.RESUME_SCREEN]: "Resume screen",
  [ROUND_TYPES.COFFEE_CHAT]: "Coffee chat",
  [ROUND_TYPES.FINAL_ROUND]: "Final round",
});

const DEFAULT_CYCLE_ROUNDS = Object.freeze([
  { type: ROUND_TYPES.RESUME_SCREEN, name: DEFAULT_ROUND_NAMES[ROUND_TYPES.RESUME_SCREEN], sortOrder: 1 },
  { type: ROUND_TYPES.COFFEE_CHAT, name: DEFAULT_ROUND_NAMES[ROUND_TYPES.COFFEE_CHAT], sortOrder: 2 },
  { type: ROUND_TYPES.FINAL_ROUND, name: DEFAULT_ROUND_NAMES[ROUND_TYPES.FINAL_ROUND], sortOrder: 3 },
]);

function normalizeRoundType(type) {
  if (type === LEGACY_INTERVIEW_TYPE) return ROUND_TYPES.COFFEE_CHAT;
  return type;
}

function isKnownRoundType(type) {
  return ROUND_TYPE_SET.has(normalizeRoundType(type));
}

function isResumeScreenType(type) {
  return normalizeRoundType(type) === ROUND_TYPES.RESUME_SCREEN;
}

function isInterviewRoundType(type) {
  const normalized = normalizeRoundType(type);
  return normalized === ROUND_TYPES.COFFEE_CHAT || normalized === ROUND_TYPES.FINAL_ROUND;
}

function formatRoundKind(type) {
  const normalized = normalizeRoundType(type);
  return ROUND_KIND_LABELS[normalized] || "Round";
}

function sortRounds(rounds) {
  return [...(rounds || [])].sort((a, b) => a.sort_order - b.sort_order);
}

function getRoundByType(rounds, type) {
  const normalized = normalizeRoundType(type);
  return (rounds || []).find((round) => normalizeRoundType(round.type) === normalized) || null;
}

function getPriorRound(rounds, round) {
  if (!round) return null;
  return sortRounds(rounds)
    .filter((candidate) => candidate.sort_order < round.sort_order)
    .pop() || null;
}

function getNextRound(rounds, round) {
  if (!round) return null;
  return sortRounds(rounds)
    .find((candidate) => candidate.sort_order > round.sort_order) || null;
}

function getInterviewRoundTypesForQuery() {
  return [ROUND_TYPES.COFFEE_CHAT, ROUND_TYPES.FINAL_ROUND, LEGACY_INTERVIEW_TYPE];
}

module.exports = {
  ROUND_TYPES,
  LEGACY_INTERVIEW_TYPE,
  ROUND_TYPE_SET,
  DEFAULT_ROUND_NAMES,
  ROUND_KIND_LABELS,
  DEFAULT_CYCLE_ROUNDS,
  normalizeRoundType,
  isKnownRoundType,
  isResumeScreenType,
  isInterviewRoundType,
  formatRoundKind,
  sortRounds,
  getRoundByType,
  getPriorRound,
  getNextRound,
  getInterviewRoundTypesForQuery,
};
