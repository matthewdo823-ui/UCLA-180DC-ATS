import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmsDecisionReload,
  confirmsDecisionSave,
} from "../src/pages/ScoreboardPage/decisionUtils.js";

const expected = {
  resumeId: "resume-1",
  candidateId: "candidate-1",
  cycleId: "cycle-1",
  roundId: "round-1",
  status: "advance",
  notes: "Committee decision",
};

test("accepts only an exact admin decision save acknowledgement", () => {
  const response = {
    resumeId: "resume-1",
    candidateId: "candidate-1",
    cycleId: "cycle-1",
    roundId: "round-1",
    decision: { status: "advance", notes: "Committee decision" },
  };

  assert.equal(confirmsDecisionSave(response, expected), true);
  assert.equal(confirmsDecisionSave({ ...response, roundId: "round-2" }, expected), false);
  assert.equal(confirmsDecisionSave({ ...response, decision: { ...response.decision, status: "hold" } }, expected), false);
});

test("requires a fresh scoreboard read to contain the exact saved decision", () => {
  const scoreboard = {
    context: { cycle: { id: "cycle-1" }, round: { id: "round-1" } },
    candidates: [{
      id: "resume-1",
      candidateId: "candidate-1",
      decision: { status: "advance", notes: "Committee decision" },
    }],
  };

  assert.equal(confirmsDecisionReload(scoreboard, expected), true);
  assert.equal(confirmsDecisionReload({ ...scoreboard, candidates: [] }, expected), false);
  assert.equal(confirmsDecisionReload({
    ...scoreboard,
    candidates: [{ ...scoreboard.candidates[0], decision: { status: "pending", notes: "" } }],
  }, expected), false);
});
