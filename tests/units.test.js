const test = require("node:test");
const assert = require("node:assert/strict");
const {
  centimetersToFeetAndInches,
  feetAndInchesToCentimeters,
  kilogramsToPounds,
  poundsToKilograms
} = require("../src/units");

test("converts height between metric storage and feet with inches", () => {
  assert.deepEqual(centimetersToFeetAndInches(165.1), {
    feet: 5,
    inches: 5
  });
  assert.equal(feetAndInchesToCentimeters(5, 5), 165.1);
});

test("converts weight between metric storage and pounds", () => {
  assert.equal(kilogramsToPounds(68.0388555), 150);
  assert.ok(Math.abs(poundsToKilograms(150) - 68.0388555) < 0.001);
});

test("keeps missing profile measurements empty", () => {
  assert.deepEqual(centimetersToFeetAndInches(null), {
    feet: null,
    inches: null
  });
  assert.equal(kilogramsToPounds(null), null);
});
