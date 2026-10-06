const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeRequiredFrqNotes } = require("../../src/utils/frqReview");

test("FRQ deliberation notes must contain non-whitespace text", () => {
  assert.equal(normalizeRequiredFrqNotes(undefined), null);
  assert.equal(normalizeRequiredFrqNotes("   "), null);
  assert.equal(normalizeRequiredFrqNotes(" Strong mission connection. "), "Strong mission connection.");
});
