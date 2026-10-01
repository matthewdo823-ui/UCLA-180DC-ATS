function firstRelated(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function coffeeRatingLabel(rating) {
  return ({
    strong_yes: "Strong yes",
    yes: "Yes",
    no: "No",
    strong_no: "Strong no",
  })[rating] || rating || "—";
}

function mapCoffeeChatGraderReview(evaluation, candidate) {
  const resume = firstRelated(candidate?.resumes);
  return {
    id: evaluation.id,
    candidateId: evaluation.candidate_id,
    resumeId: resume?.id || null,
    resumeName: candidate?.name || "Unknown candidate",
    rating: evaluation.rating,
    ratingLabel: coffeeRatingLabel(evaluation.rating),
    score: Number(evaluation.weighted_score),
    notes: evaluation.notes || "",
    submittedAt: evaluation.updated_at || evaluation.submitted_at,
  };
}

function mapInterestReviewEntry(row, { matched = null, suggestion = null } = {}) {
  return {
    id: row.id,
    eventId: row.event_id,
    eventName: row.interest_events?.name || "Event",
    status: row.status,
    submittedAt: row.submitted_at,
    submittedName: row.submitted_name,
    submittedEmail: row.submitted_email,
    submittedUniversityId: row.submitted_university_id,
    matchedCandidate: matched ? { id: matched.id, name: matched.name, email: matched.email } : null,
    suggestedCandidate: suggestion ? { id: suggestion.id, name: suggestion.name, email: suggestion.email } : null,
  };
}

module.exports = {
  mapCoffeeChatGraderReview,
  mapInterestReviewEntry,
};
