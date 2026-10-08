const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getScoreboardCoffeeChatEvaluations,
  isScoredCoffeeChatEvaluation,
  shouldIncludeCoffeeChatEvaluationInProfile,
} = require('../../src/utils/coffeeChatScoring');

test('a valid rating is scoreable without consulting table assignments', () => {
  assert.equal(isScoredCoffeeChatEvaluation({
    evaluated_by: 22,
    rating: 'strong_yes',
    weighted_score: 2,
  }), true);
});

test('notes and malformed rating rows are not scoreable', () => {
  const evaluations = [
    { evaluated_by: 22, rating: null, weighted_score: null, notes: 'Comment only' },
    { evaluated_by: 33, rating: 'yes', weighted_score: -1 },
  ];

  assert.equal(isScoredCoffeeChatEvaluation(evaluations[0]), false);
  assert.equal(isScoredCoffeeChatEvaluation(evaluations[1]), false);
});

test('candidate scoreboard selection includes valid ratings without an assignment gate', () => {
  const assigned = { id: 'assigned', evaluated_by: 11, rating: 'yes', weighted_score: 1 };
  const unassigned = { id: 'unassigned', evaluated_by: 22, rating: 'strong_no', weighted_score: -2 };
  const commentOnly = { id: 'comment', evaluated_by: 33, rating: null, weighted_score: null, notes: 'Helpful note' };
  const mismatched = { id: 'mismatched', evaluated_by: 44, rating: 'strong_yes', weighted_score: 1 };

  assert.deepEqual(
    getScoreboardCoffeeChatEvaluations([assigned, unassigned, commentOnly, mismatched]),
    [assigned, unassigned]
  );
});

test('candidate profile preserves assigned notes while adding valid unassigned ratings', () => {
  const assignedMemberIds = new Set([11]);
  const options = { assignedMemberIds };

  assert.equal(shouldIncludeCoffeeChatEvaluationInProfile(
    { evaluated_by: 11, rating: null, weighted_score: null, notes: 'Assigned note' },
    options
  ), true);
  assert.equal(shouldIncludeCoffeeChatEvaluationInProfile(
    { evaluated_by: 22, rating: 'yes', weighted_score: 1 },
    options
  ), true);
  assert.equal(shouldIncludeCoffeeChatEvaluationInProfile(
    { evaluated_by: 22, rating: null, weighted_score: null, notes: 'Unassigned note' },
    options
  ), false);
  assert.equal(shouldIncludeCoffeeChatEvaluationInProfile(
    { evaluated_by: 22, rating: null, weighted_score: null },
    { assignedMemberIds, assignmentLookupFailed: true }
  ), true);
});
