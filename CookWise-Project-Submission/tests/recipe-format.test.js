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

test("matches measured ingredients to a vague instruction", () => {
  assert.deepEqual(
    ingredientAmountsForStep("Add the cheeses, then bake.", [
      { amount: 4, unit: "cups", name: "mozzarella cheese" },
      { amount: 0.5, unit: "cup", name: "parmesan cheese" }
    ]),
    ["4 cups mozzarella cheese", "0.5 cup parmesan cheese"]
  );
});
