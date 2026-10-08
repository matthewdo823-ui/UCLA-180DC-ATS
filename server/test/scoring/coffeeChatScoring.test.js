const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isScoredCoffeeChatEvaluation,
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
