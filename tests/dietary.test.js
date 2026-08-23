const test = require("node:test");
const assert = require("node:assert/strict");
const { detectAllergens, filterForUser } = require("../src/dietary");

test("detects FDA major allergens from ingredient wording", () => {
  assert.deepEqual(
    detectAllergens([
      { original: "2 cups wheat flour" },
      { original: "1 cup milk" },
      { original: "2 tablespoons tahini" }
    ]),
    ["milk", "wheat", "sesame"]
  );
});

test("does not treat coconut milk as the milk allergen", () => {
  assert.deepEqual(detectAllergens([{ original: "1 cup coconut milk" }]), []);
});

test("does not treat clearly named alternative flour as wheat", () => {
  assert.deepEqual(
    detectAllergens([{ original: "1 cup almond flour" }]),
    ["tree-nuts"]
  );
});

test("filters recipes with a saved detected allergen", () => {
  const recipes = [
    { id: 1, allergens: ["milk"], dietaryStatus: {} },
    { id: 2, allergens: [], dietaryStatus: {} }
  ];
  assert.deepEqual(
    filterForUser(recipes, { avoided_allergens_json: '["milk"]' }).map((recipe) => recipe.id),
    [2]
  );
});
