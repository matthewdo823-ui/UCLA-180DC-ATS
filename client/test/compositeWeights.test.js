import test from "node:test";
import assert from "node:assert/strict";
import { computeWeightedCompositePercent } from "../src/utils/compositeScore.js";

test("equalized scoreboard uses the same fixed 2:1 component weighting", () => {
  assert.equal(computeWeightedCompositePercent(75, 2), 66.7);
  assert.equal(computeWeightedCompositePercent(100, 0), 66.7);
  assert.equal(computeWeightedCompositePercent(0, 4), 33.3);
});

test("a pending component leaves the completed component unchanged", () => {
  assert.equal(computeWeightedCompositePercent(82.5, null), 82.5);
  assert.equal(computeWeightedCompositePercent(null, 3), 75);
  assert.equal(computeWeightedCompositePercent(null, null), null);
});
