function hasPreferences(user) {
  return Boolean(
    user &&
      (user.preferred_servings ||
        user.preferred_cuisine ||
        user.preferred_max_cook_time ||
        user.preferred_min_protein ||
        user.preferred_diet ||
        user.avoided_allergens_json)
  );
}

function preferenceScore(recipe, user) {
  if (!hasPreferences(user)) return Number(recipe.smartScore || 0);

  let score = Number(recipe.smartScore || 0);
  if (user.preferred_servings) {
    const difference = Math.abs(
      Number(recipe.baseServings) - Number(user.preferred_servings)
    );
    score += Math.max(0, 18 - difference * 4);
  }
  if (user.preferred_cuisine) {
    score +=
      recipe.cuisine.toLowerCase() === user.preferred_cuisine.toLowerCase()
        ? 25
        : 0;
  }
  if (user.preferred_max_cook_time) {
    score +=
      recipe.cookTime <= user.preferred_max_cook_time
        ? 20
        : Math.max(-20, user.preferred_max_cook_time - recipe.cookTime);
  }
  if (user.preferred_min_protein) {
    score +=
      recipe.macros.protein >= user.preferred_min_protein
        ? 20
        : Math.max(-20, recipe.macros.protein - user.preferred_min_protein);
  }

  return Math.round(score * 10) / 10;
}

function personalizeRecipes(recipes, user) {
  return [...recipes].sort(
    (first, second) =>
      preferenceScore(second, user) - preferenceScore(first, user) ||
      second.smartScore - first.smartScore
  );
}

module.exports = { hasPreferences, preferenceScore, personalizeRecipes };
