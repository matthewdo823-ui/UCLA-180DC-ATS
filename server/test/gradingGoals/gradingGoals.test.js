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
    resumeReviewsPerApplicant: 2,
    frqReviewsPerApplicant: 2,
  });
});

test('saved cycle goals override defaults and keep resume and FRQ goals independent', () => {
  assert.deepEqual(resolveCycleGradingGoals({
    resume_grader_goal: 20,
    frq_grader_goal: 8,
    resume_reviews_per_applicant: 3,
    frq_reviews_per_applicant: 4,
  }, { GRADER_REVIEW_GOAL: '30', FRQ_REVIEW_GOAL: '30' }), {
    resumeGraderGoal: 20,
    frqGraderGoal: 8,
    resumeReviewsPerApplicant: 3,
    frqReviewsPerApplicant: 4,
  });
});

test('cycle goal updates accept positive integers', () => {
  assert.deepEqual(parseCycleGradingGoalUpdates({
    resumeGraderGoal: 25,
    frqGraderGoal: 10,
    resumeReviewsPerApplicant: 2,
    frqReviewsPerApplicant: 3,
  }), {
    updates: {
      resume_grader_goal: 25,
      frq_grader_goal: 10,
      resume_reviews_per_applicant: 2,
      frq_reviews_per_applicant: 3,
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
    { resumeReviewsPerApplicant: 0 },
    { frqReviewsPerApplicant: 1.5 },
  ]) {
    assert.match(parseCycleGradingGoalUpdates(body).error, /must be/);
  }
});
