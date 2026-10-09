export const DELIBERATION_VOTE_SCORES = Object.freeze({
  strong_yes: 2,
  yes: 1,
  no: -1,
  strong_no: -2,
});

const EMPTY_BREAKDOWN = Object.freeze({
  strong_yes: 0,
  yes: 0,
  no: 0,
  strong_no: 0,
});

function normalizeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export function applyOptimisticDeliberationVote(vote, requestedRating) {
  const nextRating = requestedRating == null || requestedRating === ""
    ? null
    : String(requestedRating).trim().toLowerCase();
  if (nextRating && !Object.prototype.hasOwnProperty.call(DELIBERATION_VOTE_SCORES, nextRating)) {
    throw new Error(`Unknown deliberation vote: ${requestedRating}`);
  }

  const currentRating = Object.prototype.hasOwnProperty.call(
    DELIBERATION_VOTE_SCORES,
    vote?.myRating
  ) ? vote.myRating : null;
  const breakdown = Object.fromEntries(
    Object.keys(EMPTY_BREAKDOWN).map((rating) => [rating, normalizeCount(vote?.breakdown?.[rating])])
  );

  if (currentRating !== nextRating) {
    if (currentRating) breakdown[currentRating] = Math.max(0, breakdown[currentRating] - 1);
    if (nextRating) breakdown[nextRating] += 1;
  }

  return {
    ...(vote || {}),
    breakdown,
    count: Object.values(breakdown).reduce((sum, count) => sum + count, 0),
    net: Object.entries(breakdown).reduce(
      (sum, [rating, count]) => sum + DELIBERATION_VOTE_SCORES[rating] * count,
      0
    ),
    myRating: nextRating,
  };
}

export function patchScoreboardWithDeliberationVote(scoreboard, resumeId, vote) {
  if (!scoreboard) return scoreboard;
  return {
    ...scoreboard,
    candidates: (scoreboard.candidates || []).map((candidate) => (
      candidate.id === resumeId ? { ...candidate, deliberationVote: vote } : candidate
    )),
  };
}

export function confirmsDeliberationVoteReload(scoreboard, resumeId, requestedRating) {
  const candidate = scoreboard?.candidates?.find((row) => String(row.id) === String(resumeId));
  if (!candidate) return false;
  const actualRating = candidate.deliberationVote?.myRating || "";
  return actualRating === (requestedRating || "");
}
