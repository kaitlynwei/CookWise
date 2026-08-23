function dayNumber(date = new Date()) {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) /
      86_400_000
  );
}

function dailyRecipeIndex(recipeCount, date = new Date()) {
  if (recipeCount <= 0) return -1;
  return dayNumber(date) % recipeCount;
}

function weeklyRotationScore(recipeId, date = new Date()) {
  const week = Math.floor(dayNumber(date) / 7);
  let value = (Number(recipeId) ^ week) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function rotateRecipes(recipes, date = new Date()) {
  return [...recipes].sort(
    (first, second) =>
      weeklyRotationScore(first.id, date) -
      weeklyRotationScore(second.id, date)
  );
}

function recommendationReason(recipe) {
  if (recipe.cookTime <= 30) {
    return "This recipe takes about 30 minutes or less, so it is a good choice for a busy day.";
  }
  if (recipe.popularityScore >= 10 || recipe.providerScore >= 90) {
    return "Today's popular pick: a highly rated recipe chosen to keep your cooking routine interesting.";
  }
  if (recipe.healthScore >= 80) {
    return "This recipe has a strong rating and health score from the provider.";
  }
  return "Try this one when you are in the mood to make something different.";
}

module.exports = {
  dailyRecipeIndex,
  recommendationReason,
  rotateRecipes,
  weeklyRotationScore
};
