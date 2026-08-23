const test = require("node:test");
const assert = require("node:assert/strict");
const { proteinTargetRange } = require("../src/nutrition-guidance");

test("calculates the current 1.2 to 1.6 gram protein range by body weight", () => {
  assert.deepEqual(proteinTargetRange(56.7), { min: 68, max: 91 });
});

test("does not calculate a protein range without a valid saved weight", () => {
  assert.equal(proteinTargetRange(null), null);
  assert.equal(proteinTargetRange(0), null);
});
