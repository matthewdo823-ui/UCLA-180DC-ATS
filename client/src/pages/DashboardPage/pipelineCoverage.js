export function withRoundCoverage(pipeline, coverage) {
  if (pipeline.mode !== 'resume' || !coverage) return pipeline;
  return {
    ...pipeline, coverage,
    applicants: coverage.resume.applicants,
    reviewed: coverage.fullyReviewedApplicants,
    awaitingReviews: coverage.resume.applicants - coverage.fullyReviewedApplicants,
    resumeReviewed: coverage.resume.reviewedApplicants,
    frqReviewed: coverage.frq.reviewedApplicants,
    resumeReviewsRemaining: coverage.resume.remaining,
    frqReviewsRemaining: coverage.frq.remaining,
  };
}
