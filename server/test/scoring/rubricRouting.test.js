const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_RUBRIC_CONFIG, getRubricForYear } = require("../../src/utils/rubric");

const routes = [
  ["Freshman", "Freshman", "/rubrics/FreshmanRubric.png", 2],
  ["Sophomore", "Sophomore", "/rubrics/SophomoreRubric.png", 3],
  ["Junior Transfer", "Junior Transfer", "/rubrics/OthersRubric.png", 2],
];

for (const [year, label, imageUrl, categoryCount] of routes) {
  test(`${year} resolves to its intended resume rubric`, () => {
    const rubric = getRubricForYear(DEFAULT_RUBRIC_CONFIG, year);
    assert.equal(rubric.label, label);
    assert.equal(rubric.imageUrl, imageUrl);
    assert.equal(rubric.metrics.length, categoryCount);
  });
}

test("default grading configuration contains only eligible year groups", () => {
  assert.deepEqual(Object.keys(DEFAULT_RUBRIC_CONFIG.byYear).sort(), ["freshman", "juniortransfer", "sophomore"]);
});

test("existing Junior & Senior configs display the correct Junior Transfer label", () => {
  const legacy = structuredClone(DEFAULT_RUBRIC_CONFIG);
  legacy.byYear.juniortransfer.label = "Junior & Senior";
  assert.equal(getRubricForYear(legacy, "Junior Transfer").label, "Junior Transfer");
});
