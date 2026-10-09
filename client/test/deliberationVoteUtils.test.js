import test from "node:test";
import assert from "node:assert/strict";
import {
  applyOptimisticDeliberationVote,
  confirmsDeliberationVoteReload,
  patchScoreboardWithDeliberationVote,
} from "../src/pages/ScoreboardPage/deliberationVoteUtils.js";

test("optimistically moves an existing vote and recomputes the live tally", () => {
  const original = {
    breakdown: { strong_yes: 1, yes: 2, no: 1, strong_no: 0 },
    count: 4,
    net: 3,
    myRating: "no",
  };

  const updated = applyOptimisticDeliberationVote(original, "strong_yes");

  assert.deepEqual(updated, {
    breakdown: { strong_yes: 2, yes: 2, no: 0, strong_no: 0 },
    count: 4,
    net: 6,
    myRating: "strong_yes",
  });
  assert.equal(original.myRating, "no");
});

test("optimistically clears a vote without producing negative counts", () => {
  const updated = applyOptimisticDeliberationVote({
    breakdown: { strong_yes: 0, yes: 0, no: 0, strong_no: 0 },
    myRating: "strong_no",
  }, "");

  assert.deepEqual(updated.breakdown, { strong_yes: 0, yes: 0, no: 0, strong_no: 0 });
  assert.equal(updated.count, 0);
  assert.equal(updated.net, 0);
  assert.equal(updated.myRating, null);
});

test("patches only the selected scoreboard candidate", () => {
  const first = { id: "resume-1", deliberationVote: { myRating: null } };
  const second = { id: "resume-2", deliberationVote: { myRating: "yes" } };
  const vote = { myRating: "strong_yes" };

  const result = patchScoreboardWithDeliberationVote({ candidates: [first, second] }, "resume-1", vote);

  assert.deepEqual(result.candidates[0].deliberationVote, vote);
  assert.equal(result.candidates[1], second);
  assert.equal(first.deliberationVote.myRating, null);
});

test("rejects an unknown optimistic vote instead of silently clearing it", () => {
  assert.throws(
    () => applyOptimisticDeliberationVote({ myRating: "yes" }, "maybe"),
    /Unknown deliberation vote/
  );
});

test("requires a fresh scoreboard read to contain the recast or cleared vote", () => {
  const scoreboard = {
    candidates: [
      { id: "resume-1", deliberationVote: { myRating: "strong_yes" } },
      { id: "resume-2", deliberationVote: { myRating: null } },
    ],
  };

  assert.equal(confirmsDeliberationVoteReload(scoreboard, "resume-1", "strong_yes"), true);
  assert.equal(confirmsDeliberationVoteReload(scoreboard, "resume-1", "yes"), false);
  assert.equal(confirmsDeliberationVoteReload(scoreboard, "resume-2", ""), true);
  assert.equal(confirmsDeliberationVoteReload(scoreboard, "missing", ""), false);
});
