import test from "node:test";
import assert from "node:assert/strict";
import { buildCandidateProfilePath, buildCandidateProfileState } from "../src/utils/candidateProfile.js";

test("candidate profile paths encode resume and optional cycle identifiers", () => {
  assert.equal(buildCandidateProfilePath("resume/one"), "/candidates/resume%2Fone");
  assert.equal(buildCandidateProfilePath("resume 1", "cycle/26"), "/candidates/resume%201?cycleId=cycle%2F26");
  assert.equal(buildCandidateProfilePath("  "), null);
});

test("candidate profile return state preserves workflow context", () => {
  assert.deepEqual(
    buildCandidateProfileState("/grader-scoreboard", { graderMode: "resume", selectedGraderId: 7 }),
    { returnTo: "/grader-scoreboard", graderMode: "resume", selectedGraderId: 7 }
  );
});
