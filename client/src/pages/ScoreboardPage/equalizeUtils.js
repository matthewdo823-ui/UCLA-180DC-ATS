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

function getMetricMax(review, fallbackMax = 4) {
  const explicitCategoryMax = Number(review?.maxPerCategory);
  if (Number.isFinite(explicitCategoryMax) && explicitCategoryMax > 0) return explicitCategoryMax;

  const metricCount = Object.keys(review?.scores || {}).length;
  const totalMax = Number(review?.maxScore);
  if (metricCount > 0 && Number.isFinite(totalMax) && totalMax > 0) {
    return totalMax / metricCount;
  }
  return fallbackMax;
}

function normalizeMetricValue(value, review, fallbackMax) {
  const raw = Number(value);
  const max = getMetricMax(review, fallbackMax);
  if (!Number.isFinite(raw) || !Number.isFinite(max) || max <= 0) return null;
  return raw / max;
}

function buildGraderMetricStats(entries, metrics, maxPerCategory) {
  const buckets = {};

  entries.forEach(({ review }) => {
    const graderKey = getGraderKey(review);
    if (!buckets[graderKey]) buckets[graderKey] = {};

    metrics.forEach(metric => {
      const value = normalizeMetricValue(review.scores?.[metric], review, maxPerCategory);
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

function buildGlobalMetricStats(entries, metrics, maxPerCategory) {
  const stats = {};

  metrics.forEach(metric => {
    const values = entries
      .map(({ review }) => normalizeMetricValue(review.scores?.[metric], review, maxPerCategory))
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
  return Number(Math.max(0, Math.min(1, adjusted)).toFixed(4));
}

function equalizeReviewScores(review, graderStats, globalStats, maxPerCategory) {
  const graderKey = getGraderKey(review);
  const graderMetricStats = graderStats[graderKey] || {};
  const adjusted = {};

  Object.entries(review.scores || {}).forEach(([metric, raw]) => {
    const normalizedRaw = normalizeMetricValue(raw, review, maxPerCategory);
    if (!Number.isFinite(normalizedRaw)) return;
    const normalizedAdjusted = equalizeMetricScore(
      normalizedRaw,
      graderMetricStats[metric],
      globalStats[metric]
    );
    adjusted[metric] = Number((normalizedAdjusted * getMetricMax(review, maxPerCategory)).toFixed(2));
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

function applyCompositeFromParts(candidate, resumeAggregateScore, resumePossibleScore, resumeNormalizedScore, frqReviews) {
  const frqAvg = averageFrqScore(frqReviews);
  const frqPending = !frqReviews.length;
  const resumeMax = Number(resumePossibleScore);
  const hasResumeScore = Number.isFinite(Number(resumeAggregateScore));
  const hasResumeMax = Number.isFinite(resumeMax) && resumeMax > 0;
  let compositeMax = hasResumeMax ? resumeMax : null;

  let aggregateScore = resumeAggregateScore;
  let normalizedScore = resumeNormalizedScore;

  if (frqAvg != null && hasResumeScore && hasResumeMax) {
    aggregateScore = Number((resumeAggregateScore + frqAvg).toFixed(1));
    compositeMax = resumeMax + FRQ_MAX_SCORE;
    normalizedScore = Number(Math.min(100, (aggregateScore / compositeMax) * 100).toFixed(1));
  } else if (frqAvg != null && !hasResumeScore) {
    aggregateScore = frqAvg;
    compositeMax = FRQ_MAX_SCORE;
    normalizedScore = Number(Math.min(100, (frqAvg / FRQ_MAX_SCORE) * 100).toFixed(1));
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
    const adjustedScores = equalizeReviewScores(review, graderStats, globalStats, FRQ_MAX_SCORE);
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
  const reviewMetrics = (candidates || []).flatMap((candidate) =>
    (candidate.reviews || []).flatMap((review) => Object.keys(review.scores || {}))
  );
  const metricList = [...new Set([
    ...metrics,
    ...reviewMetrics,
    ...(candidates || []).flatMap(c => Object.keys(c.categoryScores || {})),
  ])];

  const resumeMetrics = metricList.filter(metric => metric !== FRQ_METRIC);
  const resumeEntries = collectReviewEntries(candidates);
  const frqEntries = collectFrqEntries(candidates);

  if (!resumeEntries.length && !frqEntries.length) return candidates || [];

  const resumeGraderStats = resumeEntries.length
    ? buildGraderMetricStats(resumeEntries, resumeMetrics, maxPerCategory)
    : {};
  const resumeGlobalStats = resumeEntries.length
    ? buildGlobalMetricStats(resumeEntries, resumeMetrics, maxPerCategory)
    : {};

  const frqGraderStats = frqEntries.length
    ? buildGraderMetricStats(frqEntries, [FRQ_METRIC], FRQ_MAX_SCORE)
    : {};
  const frqGlobalStats = frqEntries.length
    ? buildGlobalMetricStats(frqEntries, [FRQ_METRIC], FRQ_MAX_SCORE)
    : {};

  return (candidates || []).map(candidate => {
    const reviews = candidate.reviews || [];
    const frqReviews = candidate.frqReviews || [];

    let resumeAggregateScore = null;
    let resumePossibleScore = null;
    let resumeNormalizedScore = null;
    let equalizedReviews = reviews;
    let equalizedFrqReviews = frqReviews;

    if (reviews.length && resumeMetrics.length) {
      let totalRaw = 0;
      let totalPossible = 0;
      let reviewCount = 0;

      equalizedReviews = reviews.map(review => {
        const adjustedScores = equalizeReviewScores(review, resumeGraderStats, resumeGlobalStats, maxPerCategory);
        const rawScore = computeRawScore(adjustedScores, Object.keys(adjustedScores));
        const reviewMax = Number(review?.maxScore)
          || Object.keys(adjustedScores).length * getMetricMax(review, maxPerCategory);

        if (Number.isFinite(rawScore) && Number.isFinite(reviewMax) && reviewMax > 0) {
          totalRaw += rawScore;
          totalPossible += reviewMax;
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
      resumePossibleScore = reviewCount > 0 ? Number((totalPossible / reviewCount).toFixed(1)) : null;
      resumeNormalizedScore = totalPossible > 0
        ? Number(((totalRaw / totalPossible) * 100).toFixed(1))
        : null;
    } else if (reviews.length) {
      resumeAggregateScore = candidate.resumeAggregateScore ?? candidate.aggregateScore ?? null;
      resumePossibleScore = candidate.resumePossiblePoints ?? candidate.resumeMax ?? null;
      resumeNormalizedScore = candidate.resumeNormalizedScore ?? candidate.normalizedScore ?? null;
    }

    if (frqReviews.length) {
      equalizedFrqReviews = equalizeFrqReviews(frqReviews, frqGraderStats, frqGlobalStats);
    }

    const composite = applyCompositeFromParts(
      candidate,
      resumeAggregateScore ?? candidate.resumeAggregateScore ?? candidate.aggregateScore,
      resumePossibleScore ?? candidate.resumePossiblePoints ?? candidate.resumeMax,
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
      resumeMax: resumePossibleScore,
      resumeEarnedPoints: resumeAggregateScore,
      resumePossiblePoints: resumePossibleScore,
      resumeNormalizedScore,
      aggregateScore: composite.aggregateScore,
      normalizedScore: composite.normalizedScore,
      categoryScores: { ...resumeCategoryScores, [FRQ_METRIC]: composite.frqScore },
      frqScore: composite.frqScore,
      frqPending: composite.frqPending,
      compositeMax: composite.compositeMax,
      earnedPoints: composite.aggregateScore,
      possiblePoints: composite.compositeMax,
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
