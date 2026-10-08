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

module.exports = {
  COFFEE_CHAT_SCORES,
  isScoredCoffeeChatEvaluation,
};
