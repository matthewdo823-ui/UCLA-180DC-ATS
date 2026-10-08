const COFFEE_CHAT_SCORES = Object.freeze({
  strong_yes: 2,
  yes: 1,
  no: -1,
  strong_no: -2,
});

function isScoredCoffeeChatEvaluation(evaluation) {
  if (!evaluation) return false;
  const expectedScore = COFFEE_CHAT_SCORES[evaluation.rating];
  return expectedScore != null && Number(evaluation.weighted_score) === expectedScore;
}

function getScoreboardCoffeeChatEvaluations(evaluations = []) {
  return evaluations.filter(isScoredCoffeeChatEvaluation);
}

function shouldIncludeCoffeeChatEvaluationInProfile(
  evaluation,
  { assignedMemberIds = new Set(), assignmentLookupFailed = false } = {}
) {
  return assignmentLookupFailed
    || assignedMemberIds.has(evaluation?.evaluated_by)
    || isScoredCoffeeChatEvaluation(evaluation);
}

module.exports = {
  COFFEE_CHAT_SCORES,
  getScoreboardCoffeeChatEvaluations,
  isScoredCoffeeChatEvaluation,
  shouldIncludeCoffeeChatEvaluationInProfile,
};
