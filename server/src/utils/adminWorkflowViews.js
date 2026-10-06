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

module.exports = { mapCoffeeChatGraderReview };
