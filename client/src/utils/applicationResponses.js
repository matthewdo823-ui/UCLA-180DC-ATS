const LEGACY_RESPONSES = [
  { camelKey: "whyConsulting", snakeKey: "why_consulting", title: "Why consulting?" },
  { camelKey: "why180dc", snakeKey: "why_180dc", title: "Why 180 Degrees Consulting?" },
  { camelKey: "whySocialImpact", snakeKey: "why_social_impact", title: "Why social impact?" },
];

export function getGradableApplicationResponses(candidate = {}) {
  if (Array.isArray(candidate.applicationResponses) && candidate.applicationResponses.length) {
    return candidate.applicationResponses
      .filter((response) => response.gradable !== false)
      .map((response, index) => ({
        questionId: response.questionId || `response-${index}`,
        title: response.title || "Application response",
        answer: response.answer || "",
      }));
  }

  return LEGACY_RESPONSES.map(({ camelKey, snakeKey, title }) => ({
    questionId: snakeKey,
    title,
    answer: candidate[camelKey] ?? candidate[snakeKey] ?? "",
  }));
}
