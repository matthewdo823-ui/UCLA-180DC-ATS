const test = require('node:test');
const assert = require('node:assert/strict');
const {
    DEFAULT_VARIANCE_THRESHOLD,
    findHighVarianceReviewPair,
    buildVarianceFlagReason,
} = require('./reviewVarianceService');

test('flags only two distinct graders whose normalized scores exceed the threshold', () => {
    const pair = findHighVarianceReviewPair([
        { graded_by: 1, normalized_score: 15 },
        { graded_by: 2, normalized_score: 80 },
    ], DEFAULT_VARIANCE_THRESHOLD);

    assert.equal(pair.difference, 65);
    assert.equal(buildVarianceFlagReason(pair), "Automatic variance alert: two independent graders' normalized scores differ by 65.0 points (15.0 vs 80.0).");
});

test('does not flag ordinary score spread, one grader, or invalid scores', () => {
    assert.equal(findHighVarianceReviewPair([
        { graded_by: 1, normalized_score: 30 },
        { graded_by: 2, normalized_score: 75 },
    ], DEFAULT_VARIANCE_THRESHOLD), null);
    assert.equal(findHighVarianceReviewPair([
        { graded_by: 1, normalized_score: 0 },
        { graded_by: 1, normalized_score: 100 },
    ], DEFAULT_VARIANCE_THRESHOLD), null);
    assert.equal(findHighVarianceReviewPair([
        { graded_by: 1, normalized_score: null },
        { graded_by: 2, normalized_score: 100 },
    ], DEFAULT_VARIANCE_THRESHOLD), null);
});

test('uses a conservative 60-point default threshold and allows a configured override', () => {
    assert.equal(DEFAULT_VARIANCE_THRESHOLD, 60);
    assert.equal(findHighVarianceReviewPair([
        { graded_by: 1, normalized_score: 20 },
        { graded_by: 2, normalized_score: 70 },
    ], DEFAULT_VARIANCE_THRESHOLD), null);
    assert.equal(findHighVarianceReviewPair([
        { graded_by: 1, normalized_score: 20 },
        { graded_by: 2, normalized_score: 70 },
    ], 50).difference, 50);
});
