import test from "node:test";
import assert from "node:assert/strict";
import {
  isAdminRole,
  isStaffRole,
} from "../src/utils/auth.js";

test("every approved staff role can participate in committee voting", () => {
  assert.equal(isStaffRole("member"), true);
  assert.equal(isStaffRole("board"), true);
  assert.equal(isStaffRole("admin"), true);
  assert.equal(isStaffRole("applicant"), false);
});

test("only admins can open the full deliberation workspace", () => {
  assert.equal(isAdminRole("member"), false);
  assert.equal(isAdminRole("board"), false);
  assert.equal(isAdminRole("admin"), true);
  assert.equal(isAdminRole("applicant"), false);
});
