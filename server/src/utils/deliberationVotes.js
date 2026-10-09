// Deliberation voting uses the same scale as Coffee Chat grading: a rating maps
// to a signed weight. Kept here (rather than imported from interviewController)
// so the deliberation path never reaches into Coffee Chat grading code — the two
// features write different tables in different round phases.
const DELIBERATION_VOTE_SCORES = Object.freeze({
  strong_yes: 2,
  yes: 1,
  no: -1,
  strong_no: -2,
});

// Display/iteration order: most positive first, matching the client tally.
const DELIBERATION_RATINGS = Object.freeze(["strong_yes", "yes", "no", "strong_no"]);

function isValidDeliberationRating(rating) {
  return Object.prototype.hasOwnProperty.call(DELIBERATION_VOTE_SCORES, rating);
}

function mapDeliberationVote(row) {
  if (!row) return null;
  return {
    id: row.id,
    candidateId: row.candidate_id,
    cycleId: row.cycle_id,
    roundId: row.round_id,
    rating: row.rating || null,
    weightedScore: row.weighted_score == null ? null : Number(row.weighted_score),
    notes: row.notes || "",
    votedBy: row.voted_by,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  };
}

function emptyBreakdown() {
  return { strong_yes: 0, yes: 0, no: 0, strong_no: 0 };
}

/**
 * Collapse a candidate's deliberation votes into the live tally the whole
 * committee sees. Each vote carries a `rating` (one of DELIBERATION_RATINGS)
 * and a `weightedScore` (its signed weight).
 *
 * Returns the shape the scoreboard and client render against:
 *   {
 *     breakdown: { strong_yes, yes, no, strong_no },  // how many of each rating
 *     count: <number of counted votes>,
 *     net:   <sum of weighted scores>,
 *   }
 *
 * Only votes with a valid rating are counted; anything else is ignored so one
 * malformed row can't skew the tally.
 *
 * @param {Array<{rating: string, weightedScore: number}>} votes
 */
function aggregateDeliberationVotes(votes) {
  const breakdown = emptyBreakdown();
  let count = 0;
  let net = 0;

  for (const vote of votes || []) {
    const rating = vote?.rating;
    if (!isValidDeliberationRating(rating)) continue;
    breakdown[rating] += 1;
    count += 1;
    // Derive the weight from the scale, never from the row, so a drifted or
    // tampered weighted_score can't skew the committee's net.
    net += DELIBERATION_VOTE_SCORES[rating];
  }

  return { breakdown, count, net };
}

module.exports = {
  DELIBERATION_VOTE_SCORES,
  DELIBERATION_RATINGS,
  isValidDeliberationRating,
  mapDeliberationVote,
  emptyBreakdown,
  aggregateDeliberationVotes,
};
