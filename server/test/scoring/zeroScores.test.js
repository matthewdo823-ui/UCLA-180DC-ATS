const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeScreeningScoresInput, computeRawScore, hasReviewScoreValues } = require('../../src/utils/rubric');

test('resume scoring accepts zero in every rubric category and counts it as reviewed', () => {
  const rubric = { metrics: ['experience', 'leadership'], maxPerCategory: 4 };
  const scores = { experience: 0, leadership: 0 };
  assert.deepEqual(normalizeScreeningScoresInput(scores, rubric), { scores });
  assert.equal(computeRawScore(scores, rubric.metrics), 0);
  assert.equal(hasReviewScoreValues({ scores }, rubric.metrics), true);
  assert.ok(normalizeScreeningScoresInput({ experience: 0 }, rubric).error);
});
