const MINIMUM_REVIEWS_PER_CANDIDATE = 3;

/**
 * Rank shared-queue work without reserving a candidate to a fixed grader
 * group. Candidates below the round minimum always come first. Within that
 * priority, prefer a candidate whose existing reviewers have little overlap
 * with the requesting grader; completing that review creates a useful
 * shared-candidate comparison for calibration.
 */
function rankSharedQueueResumes({ resumes = [], reviews = [], graderId, minimumReviews = MINIMUM_REVIEWS_PER_CANDIDATE }) {
    const requester = graderId == null ? null : String(graderId);
    const reviewersByResume = new Map();
    const pairCounts = new Map();
    const pairKey = (a, b) => [String(a), String(b)].sort().join(':');

    (reviews || []).forEach((review) => {
        if (!review?.resume_id || review.graded_by == null) return;
        const resumeId = String(review.resume_id);
        if (!reviewersByResume.has(resumeId)) reviewersByResume.set(resumeId, new Set());
        reviewersByResume.get(resumeId).add(String(review.graded_by));
    });
    reviewersByResume.forEach((reviewers) => {
        const list = [...reviewers];
        for (let i = 0; i < list.length; i += 1) {
            for (let j = i + 1; j < list.length; j += 1) {
                const key = pairKey(list[i], list[j]);
                pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
            }
        }
    });

    return [...(resumes || [])].sort((a, b) => {
        const score = (resume) => {
            const completed = Number(resume.review_count) || 0;
            const minimumGap = Math.max(0, minimumReviews - completed);
            const priorReviewers = reviewersByResume.get(String(resume.id)) || new Set();
            let overlapBenefit = 0;
            if (requester) {
                priorReviewers.forEach((grader) => {
                    if (grader === requester) return;
                    overlapBenefit += 1 / (1 + (pairCounts.get(pairKey(requester, grader)) || 0));
                });
            }
            return (minimumGap * 1000) + (overlapBenefit * 10) - (completed * 0.01);
        };
        const difference = score(b) - score(a);
        if (difference !== 0) return difference;
        return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    });
}

module.exports = { MINIMUM_REVIEWS_PER_CANDIDATE, rankSharedQueueResumes };
