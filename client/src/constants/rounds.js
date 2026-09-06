export const ROUND_TYPES = Object.freeze({
  RESUME_SCREEN: "resume_screen",
  COFFEE_CHAT: "coffee_chat",
  FINAL_ROUND: "final_round",
});

const LEGACY_INTERVIEW_TYPE = "interview";

const ROUND_KIND_LABELS = Object.freeze({
  [ROUND_TYPES.RESUME_SCREEN]: "Resume screen",
  [ROUND_TYPES.COFFEE_CHAT]: "Coffee chat",
  [ROUND_TYPES.FINAL_ROUND]: "Final round",
});

export const ROUND_PIPELINE = Object.freeze([
  { type: ROUND_TYPES.RESUME_SCREEN, label: "Round 1: Resume Screen" },
  { type: ROUND_TYPES.COFFEE_CHAT, label: "Round 2: Coffee Chats" },
  { type: ROUND_TYPES.FINAL_ROUND, label: "Round 3: Final Round" },
]);

export const ROUND_1_LABEL = ROUND_PIPELINE[0].label;

export const UPCOMING_EVALUATION_ROUNDS = ROUND_PIPELINE.slice(1).map((round, index) => ({
  id: `round-${index + 2}`,
  label: round.label,
  type: round.type,
}));

export function normalizeRoundType(type) {
  if (type === LEGACY_INTERVIEW_TYPE) return ROUND_TYPES.COFFEE_CHAT;
  return type;
}

export function isResumeScreenType(type) {
  return normalizeRoundType(type) === ROUND_TYPES.RESUME_SCREEN;
}

export function isInterviewRoundType(type) {
  const normalized = normalizeRoundType(type);
  return normalized === ROUND_TYPES.COFFEE_CHAT || normalized === ROUND_TYPES.FINAL_ROUND;
}

export function formatRoundKind(type) {
  const normalized = normalizeRoundType(type);
  return ROUND_KIND_LABELS[normalized] || "Round";
}

export function formatRoundTypeLabel(type) {
  return formatRoundKind(type);
}
