import { FRQ_METRIC, FRQ_MAX_SCORE } from "../../constants/frq";

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

function collectReviewEntries(candidates) {
  const entries = [];
  (candidates || []).forEach(candidate => {
    (candidate.reviews || []).forEach(review => {
      entries.push({ candidate, review });
    });
  });
  return entries;
}

function collectFrqEntries(candidates) {
  const entries = [];
  (candidates || []).forEach(candidate => {
    (candidate.frqReviews || []).forEach(review => {
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

function equalizeMetricScore(raw, graderStat, globalStat) {
  if (!Number.isFinite(raw)) return null;
  if (!graderStat || !globalStat || graderStat.n < 2 || graderStat.std <= 0 || globalStat.std <= 0) {
    return raw;
  }

  const z = (raw - graderStat.mean) / graderStat.std;
  const adjusted = globalStat.mean + z * globalStat.std;
  return Number(adjusted.toFixed(2));
}

function equalizeReviewScores(review, graderStats, globalStats) {
  const graderKey = getGraderKey(review);
  const graderMetricStats = graderStats[graderKey] || {};
  const adjusted = {};

  Object.entries(review.scores || {}).forEach(([metric, raw]) => {
    const numericRaw = Number(raw);
    if (!Number.isFinite(numericRaw)) return;
    adjusted[metric] = equalizeMetricScore(
      numericRaw,
      graderMetricStats[metric],
      globalStats[metric]
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
  return Number(Math.min(100, (raw / maxScore) * 100).toFixed(2));
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

function averageFrqScore(frqReviews = []) {
  if (!frqReviews.length) return null;
  const sum = frqReviews.reduce((acc, review) => acc + (Number(review.score) || 0), 0);
  return Number((sum / frqReviews.length).toFixed(1));
}

function applyCompositeFromParts(candidate, resumeAggregateScore, resumeNormalizedScore, frqReviews) {
  const frqAvg = averageFrqScore(frqReviews);
  const frqPending = !frqReviews.length;
  const resumeMax = Number(candidate.compositeMax) - (frqPending ? 0 : FRQ_MAX_SCORE);
  const compositeMax = frqPending ? resumeMax : resumeMax + FRQ_MAX_SCORE;

  let aggregateScore = resumeAggregateScore;
  let normalizedScore = resumeNormalizedScore;

  if (frqAvg != null && resumeAggregateScore != null) {
    aggregateScore = Number((resumeAggregateScore + frqAvg).toFixed(1));
    normalizedScore = Number(Math.min(100, (aggregateScore / compositeMax) * 100).toFixed(1));
  }

  return {
    aggregateScore,
    normalizedScore,
    score: normalizedScore == null ? null : Math.round(normalizedScore),
    frqScore: frqAvg,
    frqPending,
    compositeMax,
  };
}

function equalizeFrqReviews(frqReviews, graderStats, globalStats) {
  return (frqReviews || []).map(review => {
    const adjustedScores = equalizeReviewScores(review, graderStats, globalStats);
    const adjustedScore = adjustedScores[FRQ_METRIC];
    const numericScore = Number.isFinite(adjustedScore) ? adjustedScore : Number(review.score);
    return {
      ...review,
      scores: { [FRQ_METRIC]: numericScore },
      score: Number(numericScore.toFixed(2)),
      normalizedScore: Number(((numericScore / FRQ_MAX_SCORE) * 100).toFixed(2)),
      equalized: true,
    };
  });
}

/**
 * Adjust candidate scores by converting each reviewer's per-metric scores to z-scores
 * relative to that reviewer's historical average, then rescaling to the pool-wide metric mean/std.
 * Resume categories and FRQ grades are equalized separately, then merged into composite scores.
 */
export function equalizeCandidateScores(candidates, { metrics = [], maxPerCategory = 4 } = {}) {
  const metricList = metrics.length
    ? metrics
    : [...new Set((candidates || []).flatMap(c => Object.keys(c.categoryScores || {})))];

  const resumeMetrics = metricList.filter(metric => metric !== FRQ_METRIC);
  const resumeEntries = collectReviewEntries(candidates);
  const frqEntries = collectFrqEntries(candidates);

  if (!resumeEntries.length && !frqEntries.length) return candidates || [];

  const resumeGraderStats = resumeEntries.length
    ? buildGraderMetricStats(resumeEntries, resumeMetrics)
    : {};
  const resumeGlobalStats = resumeEntries.length
    ? buildGlobalMetricStats(resumeEntries, resumeMetrics)
    : {};

  const frqGraderStats = frqEntries.length
    ? buildGraderMetricStats(frqEntries, [FRQ_METRIC])
    : {};
  const frqGlobalStats = frqEntries.length
    ? buildGlobalMetricStats(frqEntries, [FRQ_METRIC])
    : {};

  return (candidates || []).map(candidate => {
    const reviews = candidate.reviews || [];
    const frqReviews = candidate.frqReviews || [];

    let resumeAggregateScore = null;
    let resumeNormalizedScore = null;
    let equalizedReviews = reviews;
    let equalizedFrqReviews = frqReviews;

    if (reviews.length && resumeMetrics.length) {
      let totalRaw = 0;
      let reviewCount = 0;

      equalizedReviews = reviews.map(review => {
        const adjustedScores = equalizeReviewScores(review, resumeGraderStats, resumeGlobalStats);
        const rawScore = computeRawScore(adjustedScores, Object.keys(adjustedScores));

        if (Number.isFinite(rawScore)) {
          totalRaw += rawScore;
          reviewCount += 1;
        }

        const normalizedScore = computeNormalizedPercent(adjustedScores, review, maxPerCategory);

        return {
          ...review,
          scores: adjustedScores,
          score: rawScore,
          normalizedScore,
          equalized: true,
        };
      });

      resumeAggregateScore = reviewCount > 0 ? Number((totalRaw / reviewCount).toFixed(1)) : null;
      const resumeMax = Number(candidate.compositeMax) - (frqReviews.length ? FRQ_MAX_SCORE : 0)
        || resumeMetrics.length * maxPerCategory;
      resumeNormalizedScore = resumeAggregateScore != null && resumeMax > 0
        ? Number(((resumeAggregateScore / resumeMax) * 100).toFixed(1))
        : null;
    } else if (reviews.length) {
      resumeAggregateScore = candidate.resumeAggregateScore ?? candidate.aggregateScore ?? null;
      resumeNormalizedScore = candidate.resumeNormalizedScore ?? candidate.normalizedScore ?? null;
    }

    if (frqReviews.length) {
      equalizedFrqReviews = equalizeFrqReviews(frqReviews, frqGraderStats, frqGlobalStats);
    }

    const composite = applyCompositeFromParts(
      candidate,
      resumeAggregateScore ?? candidate.resumeAggregateScore ?? candidate.aggregateScore,
      resumeNormalizedScore ?? candidate.resumeNormalizedScore ?? candidate.normalizedScore,
      equalizedFrqReviews
    );

    const resumeCategoryScores = reviews.length && resumeMetrics.length
      ? buildCategoryScores(equalizedReviews, resumeMetrics)
      : {};

    return {
      ...candidate,
      reviews: equalizedReviews,
      frqReviews: equalizedFrqReviews,
      resumeAggregateScore,
      resumeNormalizedScore,
      aggregateScore: composite.aggregateScore,
      normalizedScore: composite.normalizedScore,
      categoryScores: { ...resumeCategoryScores, [FRQ_METRIC]: composite.frqScore },
      frqScore: composite.frqScore,
      frqPending: composite.frqPending,
      compositeMax: composite.compositeMax,
      score: composite.score,
      sourceNormalizedScore: candidate.normalizedScore ?? candidate.score ?? null,
      sourceAggregateScore: candidate.aggregateScore ?? null,
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
