const test = require("node:test");
const assert = require("node:assert/strict");
const {
  hasPreferences,
  personalizeRecipes,
  preferenceScore
} = require("../src/preferences");

const user = {
  preferred_servings: 2,
  preferred_cuisine: "Mediterranean",
  preferred_max_cook_time: 30,
  preferred_min_protein: 20
};

function recipe(overrides = {}) {
  return {
    id: 1,
    cuisine: "International",
    baseServings: 4,
    cookTime: 50,
    smartScore: 80,
    macros: { protein: 10 },
    ...overrides
  };
}

test("detects saved cooking preferences", () => {
  assert.equal(hasPreferences(user), true);
  assert.equal(hasPreferences({}), false);
});

test("gives a stronger score to recipes matching saved preferences", () => {
  const matching = recipe({
    cuisine: "Mediterranean",
    baseServings: 2,
    cookTime: 25,
    macros: { protein: 24 }
  });
  assert.ok(preferenceScore(matching, user) > preferenceScore(recipe(), user));
});

test("personalized ordering keeps every recipe and ranks the best match first", () => {
  const recipes = [
    recipe({ id: 1 }),
    recipe({ id: 2, cuisine: "Mediterranean", baseServings: 2, cookTime: 25, macros: { protein: 24 } })
  ];
  const personalized = personalizeRecipes(recipes, user);
  assert.equal(personalized.length, 2);
  assert.equal(personalized[0].id, 2);
});
