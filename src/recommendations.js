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

const dailyMotivations = [
  "You do not have to be an expert to make a meal you are proud of today.",
  "Every confident cook started by following one recipe and giving it a try.",
  "Tonight is a good night to turn a few simple ingredients into something special.",
  "Each meal you make gives you a little more confidence for the next one.",
  "Something delicious can begin with what you already have in your kitchen.",
  "The meal you make today might become the recipe everyone asks for tomorrow.",
  "You are one recipe away from surprising yourself with what you can make.",
  "A homemade meal does not need to be perfect to be worth making.",
  "Give yourself the chance to make something worth remembering today.",
  "Cooking for yourself is one small way to show that you care.",
  "You already have everything you need to take the first step toward dinner.",
  "A little courage and a warm pan can change the way your whole evening feels.",
  "The best way to feel more comfortable in the kitchen is to cook something today.",
  "There is a meal you have never made before that could become your new favorite."
];

function dailyMotivation(date = new Date()) {
  return dailyMotivations[dayNumber(date) % dailyMotivations.length];
}

function dailyRotationScore(recipeId, date = new Date()) {
  const day = dayNumber(date);
  let value = (Number(recipeId) ^ day) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function rotateRecipes(recipes, date = new Date()) {
  return [...recipes].sort(
    (first, second) =>
      dailyRotationScore(first.id, date) -
      dailyRotationScore(second.id, date)
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
  dailyMotivation,
  dailyRecipeIndex,
  dailyRotationScore,
  recommendationReason,
  rotateRecipes
};
