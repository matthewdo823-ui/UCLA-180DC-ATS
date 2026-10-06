const test = require("node:test");
const assert = require("node:assert/strict");
const { mapCoffeeChatGraderReview } = require("../../src/utils/adminWorkflowViews");

test("Coffee Chat grader reviews carry a resume link into the candidate profile", () => {
  const review = mapCoffeeChatGraderReview({
    id: "evaluation-1",
    candidate_id: "candidate-1",
    rating: "strong_yes",
    weighted_score: 2,
    notes: "Excellent conversation",
    submitted_at: "2026-09-30T18:00:00.000Z",
  }, {
    id: "candidate-1",
    name: "Julius McClain",
    resumes: [{ id: "resume-1" }],
  });

  assert.equal(review.resumeId, "resume-1");
  assert.equal(review.resumeName, "Julius McClain");
  assert.equal(review.ratingLabel, "Strong yes");
});
