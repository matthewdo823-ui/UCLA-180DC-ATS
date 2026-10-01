const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeWeightedCompositePercent,
  applyCompositeScoringToCandidate,
} = require('../../src/services/frqScoringService');

test('fixed 2:1 weighting is independent of the resume rubric maximum', () => {
  const cases = [
    { earned: 6, possible: 8 },
    { earned: 9, possible: 12 },
    { earned: 18, possible: 24 },
  ];

  for (const { earned, possible } of cases) {
    const result = applyCompositeScoringToCandidate({
      aggregateScore: earned,
      normalizedScore: 75,
      resumeMax: possible,
      reviews: [],
      categoryScores: {},
    }, { frqReviews: [{ score: 2 }] });

    assert.equal(result.normalizedScore, 66.7);
    assert.equal(result.aggregateScore, earned + 2);
    assert.equal(result.compositeMax, possible + 4);
  }
});

test('perfect resume and zero FRQ produce 66.7%', () => {
  assert.equal(computeWeightedCompositePercent(100, 0), 66.7);
});

test('zero resume and perfect FRQ produce 33.3%', () => {
  assert.equal(computeWeightedCompositePercent(0, 4), 33.3);
});

test('a pending component does not penalize the completed component', () => {
  assert.equal(computeWeightedCompositePercent(82.5, null), 82.5);
  assert.equal(computeWeightedCompositePercent(null, 3), 75);
  assert.equal(computeWeightedCompositePercent(null, null), null);
});
