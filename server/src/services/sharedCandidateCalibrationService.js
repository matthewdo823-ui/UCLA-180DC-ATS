/**
 * Calibrate graders from candidates they have both reviewed.
 *
 * This intentionally estimates only a grader's average severity.  Unlike
 * z-score matching, it does not force graders to have the same score spread.
 * Candidate effects absorb candidate quality, so a grader is compared with
 * peers on the same resumes rather than against the pool they happened to see.
 */
const MIN_SHARED_REVIEWS = 4;
const RIDGE_REVIEWS = 10;
const MAX_ABS_BIAS = 20;
const ITERATIONS = 40;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function calibrationKey(candidate) {
  return String(candidate.id);
}

function collectEntries(candidates = []) {
  const entries = [];
  candidates.forEach((candidate) => {
    (candidate.reviews || []).forEach((review) => {
      const score = finite(review.normalizedScore);
      if (score == null || review.gradedBy == null) return;
      entries.push({
        candidateId: calibrationKey(candidate),
        graderId: String(review.gradedBy),
        score,
      });
    });
  });
  return entries;
}

function buildCandidateReviewerSets(entries) {
  const byCandidate = new Map();
  entries.forEach((entry) => {
    if (!byCandidate.has(entry.candidateId)) byCandidate.set(entry.candidateId, new Set());
    byCandidate.get(entry.candidateId).add(entry.graderId);
  });
  return byCandidate;
}

function buildConnectedComponents(candidateReviewers) {
  const neighbors = new Map();
  candidateReviewers.forEach((reviewers) => {
    const list = [...reviewers];
    list.forEach((grader) => {
      if (!neighbors.has(grader)) neighbors.set(grader, new Set());
    });
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        neighbors.get(list[i]).add(list[j]);
        neighbors.get(list[j]).add(list[i]);
      }
    }
  });

  const componentByGrader = new Map();
  let nextComponent = 0;
  neighbors.forEach((_, grader) => {
    if (componentByGrader.has(grader)) return;
    const stack = [grader];
    componentByGrader.set(grader, nextComponent);
    while (stack.length) {
      const current = stack.pop();
      (neighbors.get(current) || []).forEach((neighbor) => {
        if (componentByGrader.has(neighbor)) return;
        componentByGrader.set(neighbor, nextComponent);
        stack.push(neighbor);
      });
    }
    nextComponent += 1;
  });
  return { componentByGrader, componentCount: nextComponent };
}

/**
 * Fits score = candidate-level + grader-bias using alternating ridge updates.
 * A grader without enough co-reviewed candidates receives a zero adjustment.
 */
function buildSharedCandidateCalibration(candidates = []) {
  const entries = collectEntries(candidates);
  const candidateReviewers = buildCandidateReviewerSets(entries);
  const { componentByGrader, componentCount } = buildConnectedComponents(candidateReviewers);
  const sharedCountByGrader = new Map();

  entries.forEach((entry) => {
    if ((candidateReviewers.get(entry.candidateId)?.size || 0) > 1) {
      sharedCountByGrader.set(entry.graderId, (sharedCountByGrader.get(entry.graderId) || 0) + 1);
    }
  });

  const candidateLevel = new Map();
  const biasByGrader = new Map();
  entries.forEach((entry) => {
    if (!candidateLevel.has(entry.candidateId)) candidateLevel.set(entry.candidateId, entry.score);
    if (!biasByGrader.has(entry.graderId)) biasByGrader.set(entry.graderId, 0);
  });

  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const candidateTotals = new Map();
    entries.forEach((entry) => {
      const total = candidateTotals.get(entry.candidateId) || { sum: 0, count: 0 };
      total.sum += entry.score - (biasByGrader.get(entry.graderId) || 0);
      total.count += 1;
      candidateTotals.set(entry.candidateId, total);
    });
    candidateTotals.forEach((total, candidateId) => {
      candidateLevel.set(candidateId, total.sum / total.count);
    });

    const graderTotals = new Map();
    entries.forEach((entry) => {
      if ((candidateReviewers.get(entry.candidateId)?.size || 0) < 2) return;
      const total = graderTotals.get(entry.graderId) || { sum: 0, count: 0 };
      total.sum += entry.score - (candidateLevel.get(entry.candidateId) || entry.score);
      total.count += 1;
      graderTotals.set(entry.graderId, total);
    });
    graderTotals.forEach((total, graderId) => {
      const eligible = total.count >= MIN_SHARED_REVIEWS;
      const bias = eligible ? total.sum / (total.count + RIDGE_REVIEWS) : 0;
      biasByGrader.set(graderId, clamp(bias, -MAX_ABS_BIAS, MAX_ABS_BIAS));
    });

    // Severity is identifiable only relative to peers. Centre every connected
    // component so calibration never changes its overall score level.
    const componentTotals = new Map();
    biasByGrader.forEach((bias, graderId) => {
      if ((sharedCountByGrader.get(graderId) || 0) < MIN_SHARED_REVIEWS) return;
      const component = componentByGrader.get(graderId);
      const total = componentTotals.get(component) || { sum: 0, count: 0 };
      total.sum += bias;
      total.count += 1;
      componentTotals.set(component, total);
    });
    biasByGrader.forEach((bias, graderId) => {
      const component = componentByGrader.get(graderId);
      const total = componentTotals.get(component);
      if (!total || (sharedCountByGrader.get(graderId) || 0) < MIN_SHARED_REVIEWS) {
        biasByGrader.set(graderId, 0);
        return;
      }
      biasByGrader.set(graderId, clamp(bias - (total.sum / total.count), -MAX_ABS_BIAS, MAX_ABS_BIAS));
    });
  }

  const graders = {};
  biasByGrader.forEach((bias, graderId) => {
    const sharedReviews = sharedCountByGrader.get(graderId) || 0;
    graders[graderId] = {
      bias: Number(bias.toFixed(2)),
      sharedReviews,
      calibrated: sharedReviews >= MIN_SHARED_REVIEWS,
      component: componentByGrader.get(graderId) ?? null,
    };
  });

  return {
    method: 'shared-candidate-v1',
    reviewCount: entries.length,
    componentCount,
    minSharedReviews: MIN_SHARED_REVIEWS,
    graders,
  };
}

function applySharedCandidateCalibration(candidates = [], calibration = {}) {
  const graders = calibration.graders || {};
  return (candidates || []).map((candidate) => {
    const reviews = (candidate.reviews || []).map((review) => {
      const raw = finite(review.normalizedScore);
      const grader = review.gradedBy == null ? null : graders[String(review.gradedBy)];
      const bias = grader?.calibrated ? grader.bias : 0;
      const calibratedNormalizedScore = raw == null ? null : Number(clamp(raw - bias, 0, 100).toFixed(2));
      return { ...review, calibratedNormalizedScore, calibrationBias: bias };
    });
    const calibratedValues = reviews
      .map((review) => finite(review.calibratedNormalizedScore))
      .filter((value) => value != null);
    const equalizedResumeNormalizedScore = calibratedValues.length
      ? Number((calibratedValues.reduce((sum, value) => sum + value, 0) / calibratedValues.length).toFixed(1))
      : null;
    const resumeMax = finite(candidate.resumeMax);
    const equalizedResumeAggregateScore = equalizedResumeNormalizedScore != null && resumeMax != null
      ? Number(((equalizedResumeNormalizedScore / 100) * resumeMax).toFixed(2))
      : null;
    const hasFrq = finite(candidate.frqScore) != null;
    const compositeMax = finite(candidate.compositeMax) || resumeMax;
    const equalizedAggregateScore = hasFrq && equalizedResumeAggregateScore != null
      ? Number((equalizedResumeAggregateScore + Number(candidate.frqScore)).toFixed(2))
      : equalizedResumeAggregateScore;
    const equalizedNormalizedScore = equalizedAggregateScore != null && compositeMax != null
      ? Number(clamp((equalizedAggregateScore / compositeMax) * 100, 0, 100).toFixed(1))
      : equalizedResumeNormalizedScore;

    return {
      ...candidate,
      reviews,
      equalizedResumeNormalizedScore,
      equalizedResumeAggregateScore,
      equalizedAggregateScore,
      equalizedNormalizedScore,
      equalizedScore: equalizedNormalizedScore == null ? null : Math.round(equalizedNormalizedScore),
      calibrationReviewCount: calibratedValues.length,
    };
  });
}

module.exports = {
  MIN_SHARED_REVIEWS,
  buildSharedCandidateCalibration,
  applySharedCandidateCalibration,
};
