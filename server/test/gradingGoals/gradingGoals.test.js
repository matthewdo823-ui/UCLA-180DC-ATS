const assert = require('node:assert/strict');
const test = require('node:test');

const {
  applyReviewTarget,
  legacyGoalDefaults,
  parseCycleGradingGoalUpdates,
  resolveCycleGradingGoals,
} = require('../../src/utils/gradingGoals');

test('legacy environment goals remain the fallback for cycles without saved goals', () => {
  assert.deepEqual(legacyGoalDefaults({ GRADER_REVIEW_GOAL: '24', FRQ_REVIEW_GOAL: '12' }), {
    resume: 24,
    frq: 12,
  });
  assert.deepEqual(resolveCycleGradingGoals({}, { GRADER_REVIEW_GOAL: '18' }), {
    resumeGraderGoal: 18,
    frqGraderGoal: 18,
    resumeReviewTarget: null,
    frqReviewTarget: null,
  });
});

test('saved cycle goals override defaults and keep resume and FRQ targets independent', () => {
  assert.deepEqual(resolveCycleGradingGoals({
    resume_grader_goal: 20,
    frq_grader_goal: 8,
    resume_review_target: 3,
    frq_review_target: 2,
  }, { GRADER_REVIEW_GOAL: '30', FRQ_REVIEW_GOAL: '30' }), {
    resumeGraderGoal: 20,
    frqGraderGoal: 8,
    resumeReviewTarget: 3,
    frqReviewTarget: 2,
  });
});

test('cycle goal updates accept positive integers and explicit unlimited targets', () => {
  assert.deepEqual(parseCycleGradingGoalUpdates({
    resumeGraderGoal: 25,
    frqGraderGoal: 10,
    resumeReviewTarget: null,
    frqReviewTarget: 2,
  }), {
    updates: {
      resume_grader_goal: 25,
      frq_grader_goal: 10,
      resume_review_target: null,
      frq_review_target: 2,
    },
  });
});

test('cycle goal updates reject zero, fractions, and out-of-range values', () => {
  for (const body of [
    { resumeGraderGoal: 0 },
    { frqGraderGoal: 1.5 },
    { resumeReviewTarget: 1001 },
    { frqReviewTarget: '' },
    { resumeGraderGoal: true },
  ]) {
    assert.match(parseCycleGradingGoalUpdates(body).error, /must be/);
  }
});

test('review targets add a strict less-than queue filter only when configured', () => {
  const calls = [];
  const query = { lt(column, value) { calls.push([column, value]); return this; } };

  assert.equal(applyReviewTarget(query, 'review_count', null), query);
  assert.deepEqual(calls, []);
  assert.equal(applyReviewTarget(query, 'review_count', 3), query);
  assert.deepEqual(calls, [['review_count', 3]]);
});
