const assert = require('node:assert/strict');
const test = require('node:test');

const {
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
  });
});

test('saved cycle goals override defaults and keep resume and FRQ goals independent', () => {
  assert.deepEqual(resolveCycleGradingGoals({
    resume_grader_goal: 20,
    frq_grader_goal: 8,
  }, { GRADER_REVIEW_GOAL: '30', FRQ_REVIEW_GOAL: '30' }), {
    resumeGraderGoal: 20,
    frqGraderGoal: 8,
  });
});

test('cycle goal updates accept positive integers', () => {
  assert.deepEqual(parseCycleGradingGoalUpdates({
    resumeGraderGoal: 25,
    frqGraderGoal: 10,
  }), {
    updates: {
      resume_grader_goal: 25,
      frq_grader_goal: 10,
    },
  });
});

test('cycle goal updates reject zero, fractions, and out-of-range values', () => {
  for (const body of [
    { resumeGraderGoal: 0 },
    { frqGraderGoal: 1.5 },
    { resumeGraderGoal: 10001 },
    { frqGraderGoal: '' },
    { resumeGraderGoal: true },
  ]) {
    assert.match(parseCycleGradingGoalUpdates(body).error, /must be/);
  }
});
