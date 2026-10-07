const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeReviewCoverage, loadCoverageReviews } = require('../../src/utils/reviewCoverage');
const goals = { resumeReviewsPerApplicant: 2, frqReviewsPerApplicant: 3 };

test('coverage counts zero grades, excludes ineligible applicants, and caps each applicant separately', () => {
  const pool = [{ id: 'a' }, { id: 'b' }, { id: 'excluded', screeningExclusionReason: 'Excluded' }];
  const resumes = Array.from({ length: 5 }, () => ({ resume_id: 'a', scores: { experience: 0 } }));
  resumes.push({ resume_id: 'b', scores: {} }, { resume_id: 'excluded', scores: { experience: 4 } });
  const frqs = [{ resume_id: 'b', score: 0 }, { resume_id: 'b', score: null }];
  const coverage = summarizeReviewCoverage(pool, resumes, frqs, goals);
  assert.equal(coverage.resume.completed, 2);
  assert.equal(coverage.resume.total, 4);
  assert.equal(coverage.resume.remaining, 2);
  assert.equal(coverage.resume.fullyReviewedApplicants, 1);
  assert.equal(coverage.frq.completed, 1);
  assert.equal(coverage.frq.total, 6);
  assert.equal(coverage.frq.remaining, 5);
  assert.equal(coverage.fullyReviewedApplicants, 0);
  assert.equal(summarizeReviewCoverage([], [], [], goals).resume.percent, 0);
  assert.equal(summarizeReviewCoverage(pool, resumes, frqs, { ...goals, resumeReviewsPerApplicant: 1 }).resume.total, 2);
});

test('coverage reads beyond the default row limit and scopes every page to cycle and round', async () => {
  const ranges = [], filters = [];
  const db = { from(table) {
    assert.equal(table, 'frq_reviews');
    return { select() { return this; }, eq(key, value) { filters.push([key, value]); return this; }, order() { return this; },
      async range(start, end) { ranges.push([start, end]); return { data: Array.from({ length: start === 0 ? 1000 : 1 }, () => ({ score: 0 })) }; } };
  } };
  assert.equal((await loadCoverageReviews(db, 'frq_reviews', 'cycle', 'round')).length, 1001);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
  assert.deepEqual(filters, [['cycle_id', 'cycle'], ['round_id', 'round'], ['cycle_id', 'cycle'], ['round_id', 'round']]);
});
