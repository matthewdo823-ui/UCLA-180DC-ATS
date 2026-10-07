import test from 'node:test';
import assert from 'node:assert/strict';
import { withRoundCoverage } from '../src/pages/DashboardPage/pipelineCoverage.js';
test('admin pipeline uses required coverage rather than first-review counts', () => {
  const pipeline = { mode: 'resume', reviewed: 10, applicants: 10, advanced: 3 };
  const coverage = { fullyReviewedApplicants: 2,
    resume: { applicants: 10, reviewedApplicants: 10, remaining: 5 },
    frq: { applicants: 10, reviewedApplicants: 10, remaining: 6 } };
  const result = withRoundCoverage(pipeline, coverage);
  assert.equal(result.reviewed, 2);
  assert.equal(result.awaitingReviews, 8);
  assert.equal(result.resumeReviewsRemaining, 5);
  assert.equal(result.frqReviewsRemaining, 6);
  assert.equal(result.advanced, 3);
  const interview = { mode: 'interview' };
  assert.equal(withRoundCoverage(interview, coverage), interview);
});
