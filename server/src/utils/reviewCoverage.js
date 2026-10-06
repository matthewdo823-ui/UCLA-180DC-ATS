const { hasReviewScoreValues } = require('./rubric');

function summarizeReviewCoverage(pool, resumeReviews, frqReviews, goals) {
  const eligible = pool.filter(candidate => !candidate.screeningExclusionReason);
  function summarize(reviews, perApplicant, valid) {
    const counts = new Map(eligible.map(candidate => [candidate.id, 0]));
    for (const review of reviews) {
      if (counts.has(review.resume_id) && valid(review)) {
        counts.set(review.resume_id, counts.get(review.resume_id) + 1);
      }
    }
    const values = [...counts.values()];
    const completed = values.reduce((sum, count) => sum + Math.min(count, perApplicant), 0);
    const total = eligible.length * perApplicant;
    return {
      applicants: eligible.length, perApplicant, completed, total,
      remaining: total - completed,
      percent: total ? Math.round(completed / total * 100) : 0,
      reviewedApplicants: values.filter(count => count > 0).length,
      fullyReviewedApplicants: values.filter(count => count >= perApplicant).length,
    };
  }
  return {
    resume: summarize(resumeReviews, goals.resumeReviewsPerApplicant, hasReviewScoreValues),
    frq: summarize(frqReviews, goals.frqReviewsPerApplicant, review => Number.isInteger(review.score) && review.score >= 0 && review.score <= 4),
  };
}

async function loadCoverageReviews(db, table, cycleId, roundId) {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from(table)
      .select(table === 'resume_reviews' ? 'id,resume_id,scores' : 'id,resume_id,score')
      .eq('cycle_id', cycleId).eq('round_id', roundId)
      .order('id', { ascending: true }).range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

module.exports = { summarizeReviewCoverage, loadCoverageReviews };
