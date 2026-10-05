const test = require("node:test");
const assert = require("node:assert/strict");
const { mapInterestReviewEntry } = require("../../src/utils/adminWorkflowViews");

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
