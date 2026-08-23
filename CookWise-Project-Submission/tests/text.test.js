const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanIngredientName, cleanPunctuation } = require("../src/text");

test("removes spaces before punctuation in imported recipe text", () => {
  assert.equal(
    cleanPunctuation("353 calories , 38g of protein , and 20g of fat ."),
    "353 calories, 38g of protein, and 20g of fat."
  );
});

test("preserves abbreviations while collapsing extra spaces", () => {
  assert.equal(
    cleanPunctuation("A U.S. recipe with   clear steps."),
    "A U.S. recipe with clear steps."
  );
});

test("adds missing spaces between imported sentences", () => {
  assert.equal(
    cleanPunctuation("Put flour in one.Dredge chicken.Then bake."),
    "Put flour in one. Dredge chicken. Then bake."
  );
});

test("adds missing spaces after commas before lowercase words", () => {
  assert.equal(
    cleanPunctuation("lettuce,radis,pesa,and shrimp"),
    "lettuce, radish, peas, and shrimp"
  );
});

test("corrects verified imported recipe misspellings", () => {
  assert.equal(
    cleanPunctuation("Mediterrean salad with Pean and radis"),
    "Mediterranean salad with Pea and radish"
  );
});

test("removes preparation fragments from ingredient names", () => {
  assert.equal(
    cleanIngredientName("romaine lettuce torn or"),
    "romaine lettuce"
  );
});
