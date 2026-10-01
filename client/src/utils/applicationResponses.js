// Shown per-field when a response has an answer but no renderable question title.
export const UNRENDERABLE_QUESTION_LABEL = "Unable to render question field";
// Shown in place of the whole panel when there are no gradable responses to render.
export const UNRENDERABLE_RESPONSES_MESSAGE = "Unable to render application responses";

// Responses come straight from the candidate's application_responses snapshot.
// There is intentionally no legacy why_* fallback: pre-catalog cycles were
// test-only, so an empty snapshot renders an honest "unable to render" state
// rather than inventing three hard-coded essays that may not match the form.
export function getGradableApplicationResponses(candidate = {}) {
  const responses = Array.isArray(candidate.applicationResponses) ? candidate.applicationResponses : [];
  return responses
    .filter((response) => response.gradable !== false)
    .map((response, index) => ({
      questionId: response.questionId || `response-${index}`,
      title: typeof response.title === "string" && response.title.trim() ? response.title.trim() : null,
      answer: response.answer || "",
    }));
}
