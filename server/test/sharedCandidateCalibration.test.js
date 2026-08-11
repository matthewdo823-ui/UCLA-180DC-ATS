const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSharedCandidateCalibration,
  applySharedCandidateCalibration,
} = require('../src/services/sharedCandidateCalibrationService');
const { rankSharedQueueResumes } = require('../src/services/sharedQueueRankingService');

test('shared-candidate calibration shrinks a consistent grader difference', () => {
  const candidates = ['a', 'b', 'c', 'd'].map((id, index) => ({
    id,
    resumeMax: 8,
    compositeMax: 8,
    reviews: [
      { gradedBy: 1, normalizedScore: [60, 80, 40, 90][index] },
      { gradedBy: 2, normalizedScore: [50, 70, 30, 80][index] },
    ],
  }));

  const calibration = buildSharedCandidateCalibration(candidates);
  assert.equal(calibration.graders['1'].calibrated, true);
  assert.equal(calibration.graders['2'].calibrated, true);
  assert(calibration.graders['1'].bias > 0);
  assert(calibration.graders['2'].bias < 0);

  const calibrated = applySharedCandidateCalibration(candidates, calibration);
  const rawDifference = 10;
  const adjustedDifference = Math.abs(
    calibrated[0].reviews[0].calibratedNormalizedScore
      - calibrated[0].reviews[1].calibratedNormalizedScore
  );
  assert(adjustedDifference < rawDifference);
  assert.equal(calibrated[0].equalizedNormalizedScore, 55);
});

test('queue prioritizes the minimum review target and useful new overlap', () => {
  const resumes = [
    { id: 'new', review_count: 0, created_at: '2026-01-01' },
    { id: 'bridge', review_count: 1, created_at: '2026-01-01' },
    { id: 'later', review_count: 3, created_at: '2026-01-01' },
  ];
  const reviews = [
    { resume_id: 'bridge', graded_by: 2 },
    { resume_id: 'old-a', graded_by: 1 },
    { resume_id: 'old-a', graded_by: 3 },
  ];
  const ranked = rankSharedQueueResumes({ resumes, reviews, graderId: 1 });
  assert.deepEqual(ranked.map((row) => row.id), ['new', 'bridge', 'later']);
});
