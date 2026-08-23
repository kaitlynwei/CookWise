const test = require("node:test");
const assert = require("node:assert/strict");
const { achievementSummary } = require("../src/achievements");
const {
  dailyMotivation,
  dailyRecipeIndex,
  recommendationReason,
  rotateRecipes
} = require("../src/recommendations");

test("daily motivation stays stable for a day and includes punctuation", () => {
  const firstDate = new Date(2026, 7, 17);
  const nextDate = new Date(2026, 7, 18);
  assert.equal(dailyMotivation(firstDate), dailyMotivation(firstDate));
  assert.notEqual(dailyMotivation(firstDate), dailyMotivation(nextDate));
  assert.match(dailyMotivation(firstDate), /[.!?]$/);
});

test("daily recommendation stays stable for a day and changes the next day", () => {
  const firstDate = new Date(2026, 7, 5);
  const nextDate = new Date(2026, 7, 6);
  assert.equal(dailyRecipeIndex(53, firstDate), dailyRecipeIndex(53, firstDate));
  assert.notEqual(dailyRecipeIndex(53, firstDate), dailyRecipeIndex(53, nextDate));
});

test("daily rotation preserves recipes while changing their order", () => {
  const recipes = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }];
  const first = rotateRecipes(recipes, new Date(2026, 7, 5));
  const later = rotateRecipes(recipes, new Date(2026, 7, 6));
  assert.deepEqual(first.map((recipe) => recipe.id).sort(), [1, 2, 3, 4, 5]);
  assert.notDeepEqual(first, later);
});

test("recommendation reason favors convenient meals", () => {
  assert.match(
    recommendationReason({ cookTime: 20, popularityScore: 1, providerScore: 70, healthScore: 50 }),
    /30 minutes or less/
  );
});

test("achievement counts stack across recipes", () => {
  const achievements = achievementSummary(6, 2);
  assert.equal(achievements[0].name, "Taste Trailblazer");
  assert.equal(achievements[0].count, 6);
  assert.equal(achievements[1].name, "Encore Expert");
  assert.equal(achievements[1].count, 2);
});
