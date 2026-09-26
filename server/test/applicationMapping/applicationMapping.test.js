const test = require("node:test");
const assert = require("node:assert/strict");

const { mapFormResponseToCandidate } = require("../../src/utils/dataMapper");
const { buildSuggestedFieldMap, validateFieldMap } = require("../../src/utils/googleForm");
const { buildSummaryPrompt } = require("../../src/services/candidateSummaryService");

function textAnswer(value) {
  return { textAnswers: { answers: [{ value }] } };
}

test("combines first and last name and snapshots exact gradable question titles", () => {
  const response = {
    responseId: "response-1",
    answers: {
      first: textAnswer("Joe"),
      last: textAnswer("Bruin"),
      email: textAnswer("joe@example.com"),
      motivation: textAnswer("I want to use consulting for community impact."),
      heard: textAnswer("A friend"),
    },
  };
  const config = {
    fieldMap: {
      first: "first_name",
      last: "last_name",
      email: "email",
      heard: "referral_source",
    },
    questionCatalog: [{
      questionId: "motivation",
      title: "Why consulting and why 180DC UCLA?",
      type: "paragraph",
    }],
    gradableQuestionIds: ["motivation"],
  };

  const mapped = mapFormResponseToCandidate(response, config);
  assert.equal(mapped.candidateRow.name, "Joe Bruin");
  assert.equal(mapped.candidateRow.first_name, "Joe");
  assert.equal(mapped.candidateRow.last_name, "Bruin");
  assert.equal(mapped.candidateRow.referral_source, "A friend");
  assert.deepEqual(mapped.candidateRow.application_responses, [{
    questionId: "motivation",
    title: "Why consulting and why 180DC UCLA?",
    answer: "I want to use consulting for community impact.",
    gradable: true,
  }]);
});

test("title suggestions keep referral source separate from Why 180DC", () => {
  const questions = [
    { questionId: "heard", title: "How did you hear about 180DC?" },
    { questionId: "first", title: "First Name" },
    { questionId: "last", title: "Last Name" },
    { questionId: "essay", title: "Why are you interested in consulting and joining 180DC?" },
    { questionId: "programs", title: "Share upcoming internships or professional development programs, including company names." },
  ];
  assert.deepEqual(buildSuggestedFieldMap(questions), {
    heard: "referral_source",
    first: "first_name",
    last: "last_name",
    programs: "professional_development",
  });
});

test("field map requires identity and rejects duplicate destinations", () => {
  assert.equal(validateFieldMap({ first: "first_name", last: "last_name", email: "email" }), null);
  assert.match(
    validateFieldMap({ first: "name", preferred: "name", email: "email" }),
    /Only one question can map to name/
  );
});

test("a paragraph mentioning a resume does not steal the resume upload mapping", () => {
  const questions = [
    { questionId: "essay", title: "Beyond the experiences on your resume, tell us about yourself", type: "paragraph" },
    { questionId: "upload", title: "Please attach your resume below", type: "file_upload" },
  ];
  assert.deepEqual(buildSuggestedFieldMap(questions), { upload: "resume_file_url" });
});

test("summary prompts use saved question titles and exclude non-gradable responses", () => {
  const prompt = buildSummaryPrompt({
    candidate: {
      name: "Joe Bruin",
      applicationResponses: [
        { questionId: "essay", title: "Why consulting and why 180DC UCLA?", answer: "My answer", gradable: true },
        { questionId: "extra", title: "Upcoming internships", answer: "Private detail", gradable: false },
      ],
    },
    context: { cycle: { name: "Fall 26" }, round: { name: "Resume Screen" } },
  });
  assert.match(prompt, /Why consulting and why 180DC UCLA\?/);
  assert.doesNotMatch(prompt, /Upcoming internships|Private detail/);
});
