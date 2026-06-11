function getGraderKey(review) {
  if (review?.gradedBy != null) return String(review.gradedBy);
  if (review?.reviewerEmail) return review.reviewerEmail.trim().toLowerCase();
  if (review?.reviewerName) return review.reviewerName.trim().toLowerCase();
  if (review?.id != null) return `review-${review.id}`;
  return "unknown-grader";
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values, avg) {
  if (values.length < 2) return 0;
  const m = avg ?? mean(values);
  const variance = values.reduce((sum, value) => sum + (value - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function clampScore(value, maxPerCategory) {
  return Math.max(1, Math.min(maxPerCategory, value));
}

function collectReviewEntries(candidates) {
  const entries = [];
  (candidates || []).forEach(candidate => {
    (candidate.reviews || []).forEach(review => {
      entries.push({ candidate, review });
    });
  });
  return entries;
}

function buildGraderMetricStats(entries, metrics) {
  const buckets = {};

  entries.forEach(({ review }) => {
    const graderKey = getGraderKey(review);
    if (!buckets[graderKey]) buckets[graderKey] = {};

    metrics.forEach(metric => {
      const value = Number(review.scores?.[metric]);
      if (!Number.isFinite(value)) return;
      if (!buckets[graderKey][metric]) buckets[graderKey][metric] = [];
      buckets[graderKey][metric].push(value);
    });
  });

  const stats = {};
  Object.entries(buckets).forEach(([graderKey, metricBuckets]) => {
    stats[graderKey] = {};
    Object.entries(metricBuckets).forEach(([metric, values]) => {
      const metricMean = mean(values);
      stats[graderKey][metric] = {
        mean: metricMean,
        std: stdDev(values, metricMean),
        n: values.length,
      };
    });
  });

  return stats;
}

function buildGlobalMetricStats(entries, metrics) {
  const stats = {};

  metrics.forEach(metric => {
    const values = entries
      .map(({ review }) => Number(review.scores?.[metric]))
      .filter(value => Number.isFinite(value));

    const metricMean = mean(values);
    stats[metric] = {
      mean: metricMean,
      std: stdDev(values, metricMean),
      n: values.length,
    };
  });

  return stats;
}

function equalizeMetricScore(raw, graderStat, globalStat, maxPerCategory) {
  if (!Number.isFinite(raw)) return null;
  if (!graderStat || !globalStat || graderStat.n < 2 || graderStat.std <= 0 || globalStat.std <= 0) {
    return raw;
  }

  const z = (raw - graderStat.mean) / graderStat.std;
  const adjusted = globalStat.mean + z * globalStat.std;
  return Number(clampScore(adjusted, maxPerCategory).toFixed(2));
}

function equalizeReviewScores(review, graderStats, globalStats, maxPerCategory) {
  const graderKey = getGraderKey(review);
  const graderMetricStats = graderStats[graderKey] || {};
  const adjusted = {};

  Object.entries(review.scores || {}).forEach(([metric, raw]) => {
    const numericRaw = Number(raw);
    if (!Number.isFinite(numericRaw)) return;
    adjusted[metric] = equalizeMetricScore(
      numericRaw,
      graderMetricStats[metric],
      globalStats[metric],
      maxPerCategory
    );
  });

  return adjusted;
}

function computeRawScore(scores, metrics) {
  const keys = metrics?.length ? metrics : Object.keys(scores || {});
  return keys.reduce((sum, metric) => sum + (Number(scores[metric]) || 0), 0);
}

function computeNormalizedPercent(scores, review, maxPerCategory) {
  const metrics = Object.keys(scores || {});
  if (!metrics.length) return null;

  const maxScore = Number(review?.maxScore) || metrics.length * maxPerCategory;
  if (!Number.isFinite(maxScore) || maxScore <= 0) return null;

  const raw = computeRawScore(scores, metrics);
  return Number(((raw / maxScore) * 100).toFixed(2));
}

function buildCategoryScores(reviews, metrics) {
  const totals = {};
  const counts = {};

  reviews.forEach(review => {
    metrics.forEach(metric => {
      const value = Number(review.scores?.[metric]);
      if (!Number.isFinite(value)) return;
      totals[metric] = (totals[metric] || 0) + value;
      counts[metric] = (counts[metric] || 0) + 1;
    });
  });

  const categoryScores = {};
  metrics.forEach(metric => {
    const count = counts[metric] || 0;
    categoryScores[metric] = count > 0 ? Number((totals[metric] / count).toFixed(1)) : null;
  });

  return categoryScores;
}

/**
 * Adjust candidate scores by converting each reviewer's per-metric scores to z-scores
 * relative to that reviewer's historical average, then rescaling to the pool-wide metric mean/std.
 */
export function equalizeCandidateScores(candidates, { metrics = [], maxPerCategory = 4 } = {}) {
  const metricList = metrics.length
    ? metrics
    : [...new Set((candidates || []).flatMap(c => Object.keys(c.categoryScores || {})))];

  const entries = collectReviewEntries(candidates);
  if (!entries.length) return candidates || [];

  const graderStats = buildGraderMetricStats(entries, metricList);
  const globalStats = buildGlobalMetricStats(entries, metricList);

  return (candidates || []).map(candidate => {
    const reviews = candidate.reviews || [];
    if (!reviews.length) return candidate;

    let totalRaw = 0;
    let totalNormalized = 0;
    let reviewCount = 0;

    const equalizedReviews = reviews.map(review => {
      const adjustedScores = equalizeReviewScores(review, graderStats, globalStats, maxPerCategory);
      const rawScore = computeRawScore(adjustedScores, Object.keys(adjustedScores));
      const normalizedScore = computeNormalizedPercent(adjustedScores, review, maxPerCategory);

      if (normalizedScore != null) {
        totalRaw += rawScore;
        totalNormalized += normalizedScore;
        reviewCount += 1;
      }

      return {
        ...review,
        scores: adjustedScores,
        score: rawScore,
        normalizedScore,
        equalized: true,
      };
    });

    const aggregateScore = reviewCount > 0 ? Number((totalRaw / reviewCount).toFixed(1)) : null;
    const normalizedScore = reviewCount > 0 ? Number((totalNormalized / reviewCount).toFixed(1)) : null;
    const categoryScores = buildCategoryScores(equalizedReviews, metricList);

    return {
      ...candidate,
      reviews: equalizedReviews,
      aggregateScore,
      normalizedScore,
      categoryScores,
      score: normalizedScore == null ? null : Math.round(normalizedScore),
      equalized: true,
    };
  });
}

export function recomputeEqualizedStats(candidates) {
  const reviewed = (candidates || []).filter(c => (c.numReviews ?? c.reviews?.length ?? 0) > 0);
  const normalizedValues = reviewed
    .map(c => Number(c.normalizedScore ?? c.score))
    .filter(value => Number.isFinite(value));

  const avgScore = normalizedValues.length
    ? Number((normalizedValues.reduce((sum, value) => sum + value, 0) / normalizedValues.length).toFixed(1))
    : 0;

  return { avgScore };
}
