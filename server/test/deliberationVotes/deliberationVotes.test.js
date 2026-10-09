const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DELIBERATION_VOTE_SCORES,
  isValidDeliberationRating,
  mapDeliberationVote,
  aggregateDeliberationVotes,
} = require('../../src/utils/deliberationVotes');

test('the scale matches the Coffee Chat weights exactly', () => {
  assert.deepEqual(DELIBERATION_VOTE_SCORES, {
    strong_yes: 2,
    yes: 1,
    no: -1,
    strong_no: -2,
  });
});

test('isValidDeliberationRating accepts only the four ratings', () => {
  for (const rating of ['strong_yes', 'yes', 'no', 'strong_no']) {
    assert.equal(isValidDeliberationRating(rating), true);
  }
  for (const rating of ['', 'maybe', 'STRONG_YES', null, undefined]) {
    assert.equal(isValidDeliberationRating(rating), false);
  }
});

test('mapDeliberationVote projects a row to the client shape', () => {
  const mapped = mapDeliberationVote({
    id: 'v1',
    candidate_id: 'c1',
    cycle_id: 'cy1',
    round_id: 'r1',
    rating: 'yes',
    weighted_score: 1,
    notes: 'solid',
    voted_by: 7,
    submitted_at: '2026-10-08T00:00:00Z',
    updated_at: '2026-10-08T00:00:00Z',
  });
  assert.equal(mapped.candidateId, 'c1');
  assert.equal(mapped.rating, 'yes');
  assert.equal(mapped.weightedScore, 1);
  assert.equal(mapped.votedBy, 7);
  assert.equal(mapDeliberationVote(null), null);
});

test('aggregateDeliberationVotes tallies breakdown, count, and net', () => {
  const tally = aggregateDeliberationVotes([
    { rating: 'strong_yes', weightedScore: 2 },
    { rating: 'strong_yes', weightedScore: 2 },
    { rating: 'yes', weightedScore: 1 },
    { rating: 'no', weightedScore: -1 },
    { rating: 'strong_no', weightedScore: -2 },
  ]);
  assert.deepEqual(tally.breakdown, { strong_yes: 2, yes: 1, no: 1, strong_no: 1 });
  assert.equal(tally.count, 5);
  // 2 + 2 + 1 - 1 - 2 = 2
  assert.equal(tally.net, 2);
});

test('aggregateDeliberationVotes ignores malformed ratings', () => {
  const tally = aggregateDeliberationVotes([
    { rating: 'yes', weightedScore: 1 },
    { rating: 'maybe', weightedScore: 5 },
    { rating: null, weightedScore: 0 },
  ]);
  assert.deepEqual(tally.breakdown, { strong_yes: 0, yes: 1, no: 0, strong_no: 0 });
  assert.equal(tally.count, 1);
  assert.equal(tally.net, 1);
});

test('aggregateDeliberationVotes handles an empty slate', () => {
  const tally = aggregateDeliberationVotes([]);
  assert.deepEqual(tally.breakdown, { strong_yes: 0, yes: 0, no: 0, strong_no: 0 });
  assert.equal(tally.count, 0);
  assert.equal(tally.net, 0);
});
