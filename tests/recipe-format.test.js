const test = require("node:test");
const assert = require("node:assert/strict");
const {
  convertIngredientToUs,
  convertTextToUs,
  ingredientAmountsForStep
} = require("../src/recipe-format");

test("converts metric ingredient measurements to common US units", () => {
  assert.deepEqual(convertIngredientToUs({ amount: 225, unit: "g", name: "flour" }), {
    amount: 7.94,
    unit: "ounces",
    name: "flour"
  });
  assert.equal(convertIngredientToUs({ amount: 250, unit: "ml" }).unit, "cups");
});

test("converts temperatures and pan measurements in instructions", () => {
  assert.equal(
    convertTextToUs("Bake at 180C in a 22cm pan."),
    "Bake at 356°F in a 8.66 inches pan."
  );
});

test("does not apply recipe totals to a step without an explicit amount", () => {
  assert.deepEqual(
    ingredientAmountsForStep("Add the cheeses, then bake.", [
      { amount: 4, unit: "cups", name: "mozzarella cheese" },
      { amount: 0.5, unit: "cup", name: "parmesan cheese" }
    ]),
    []
  );
});

test("uses only ingredient amounts explicitly written in an instruction", () => {
  assert.deepEqual(
    ingredientAmountsForStep(
      "Stir in 1 tablespoon of the tomato paste and 2 cups vegetable broth.",
      [
        { amount: 3, unit: "tbsp", name: "tomato paste" },
        { amount: 6, unit: "cups", name: "vegetable broth" }
      ]
    ),
    ["1 tablespoon tomato paste", "2 cups vegetable broth"]
  );
});
