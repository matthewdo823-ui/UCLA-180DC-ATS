const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mapCoffeeChatGraderReview,
  mapInterestReviewEntry,
} = require("../../src/utils/adminWorkflowViews");

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

test("Interest review rows expose only compact identity and event fields", () => {
  const entry = mapInterestReviewEntry({
    id: "attendance-1",
    event_id: "event-1",
    status: "unmatched",
    submitted_at: "2026-09-30T18:00:00.000Z",
    submitted_name: "Julius McClain",
    submitted_email: "julius@example.com",
    submitted_university_id: "123456789",
    answers: { huge_availability_answer: "Monday through Friday..." },
    interest_events: { name: "Info Night" },
  });

  assert.deepEqual(Object.keys(entry).sort(), [
    "eventId",
    "eventName",
    "id",
    "matchedCandidate",
    "status",
    "submittedAt",
    "submittedEmail",
    "submittedName",
    "submittedUniversityId",
    "suggestedCandidate",
  ].sort());
  assert.equal("otherAnswers" in entry, false);
});
