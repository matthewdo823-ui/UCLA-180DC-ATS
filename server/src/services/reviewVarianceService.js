const DEFAULT_VARIANCE_THRESHOLD = 60;

function getVarianceThreshold(value = process.env.AUTO_FLAG_VARIANCE_THRESHOLD) {
    const configured = Number(value);
    return Number.isFinite(configured) && configured >= 1 && configured <= 100
        ? configured
        : DEFAULT_VARIANCE_THRESHOLD;
}

function findHighVarianceReviewPair(reviews, threshold = getVarianceThreshold()) {
    const scoredReviews = (reviews || [])
        .map((review) => ({
            ...review,
            normalizedScore: Number(review.normalized_score ?? review.normalizedScore),
        }))
        .filter((review) => review.graded_by != null && Number.isFinite(review.normalizedScore));

    const graders = new Set(scoredReviews.map((review) => review.graded_by));
    if (graders.size < 2) return null;

    const lowest = scoredReviews.reduce((current, review) =>
        review.normalizedScore < current.normalizedScore ? review : current
    );
    const highest = scoredReviews.reduce((current, review) =>
        review.normalizedScore > current.normalizedScore ? review : current
    );
    const difference = highest.normalizedScore - lowest.normalizedScore;

    if (highest.graded_by === lowest.graded_by || difference < threshold) return null;

    return {
        lowest,
        highest,
        difference: Number(difference.toFixed(1)),
    };
}

function buildVarianceFlagReason(pair) {
    return `Automatic variance alert: two independent graders' normalized scores differ by ${pair.difference.toFixed(1)} points (${pair.lowest.normalizedScore.toFixed(1)} vs ${pair.highest.normalizedScore.toFixed(1)}).`;
}

module.exports = {
    DEFAULT_VARIANCE_THRESHOLD,
    getVarianceThreshold,
    findHighVarianceReviewPair,
    buildVarianceFlagReason,
};
