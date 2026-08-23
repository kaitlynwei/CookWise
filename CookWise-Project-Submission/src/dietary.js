const ALLERGENS = [
  "milk",
  "egg",
  "fish",
  "shellfish",
  "tree-nuts",
  "peanuts",
  "wheat",
  "soy",
  "sesame"
];

const labels = {
  milk: "Milk",
  egg: "Egg",
  fish: "Fish",
  shellfish: "Crustacean shellfish",
  "tree-nuts": "Tree nuts",
  peanuts: "Peanuts",
  wheat: "Wheat",
  soy: "Soybeans",
  sesame: "Sesame"
};

const patterns = {
  milk: /\b(milk|butter|cheese|cream|yogurt|yoghurt|whey|casein|ghee)\b/i,
  egg: /\b(egg|eggs|mayonnaise|meringue)\b/i,
  fish: /\b(salmon|tuna|cod|tilapia|trout|anchov(?:y|ies)|sardine|halibut|fish)\b/i,
  shellfish: /\b(shrimp|prawn|crab|lobster|crayfish|crawfish)\b/i,
  "tree-nuts": /\b(almond|walnut|pecan|cashew|pistachio|hazelnut|macadamia|brazil nut|pine nut)\b/i,
  peanuts: /\b(peanut|groundnut)\b/i,
  wheat: /\b(wheat|flour|bread|breadcrumb|pasta|couscous|semolina|farro|spelt)\b/i,
  soy: /\b(soy|soya|tofu|tempeh|edamame|miso)\b/i,
  sesame: /\b(sesame|tahini)\b/i
};

function ingredientText(ingredients) {
  return ingredients
    .map((ingredient) => ingredient.original || ingredient.name || "")
    .join(" ")
    .replace(/\b(coconut|oat|almond|rice) milk\b/gi, "plant beverage")
    .replace(/\b(almond|coconut|rice|chickpea|cassava|tapioca) flour\b/gi, "$1 nonwheat powder")
    .replace(/\bgluten[- ]free flour\b/gi, "nonwheat powder");
}

function detectAllergens(ingredients = []) {
  const text = ingredientText(ingredients);
  return ALLERGENS.filter((allergen) => patterns[allergen].test(text));
}

function parseAvoidedAllergens(value) {
  try {
    const parsed = Array.isArray(value) ? value : JSON.parse(value || "[]");
    return parsed.filter((allergen) => ALLERGENS.includes(allergen));
  } catch {
    return [];
  }
}

function filterForUser(recipes, user) {
  const avoided = parseAvoidedAllergens(user?.avoided_allergens_json);
  const preferredDiet = user?.preferred_diet || "";
  return recipes.filter((recipe) => {
    if (avoided.some((allergen) => recipe.allergens.includes(allergen))) {
      return false;
    }
    if (!preferredDiet) return true;
    const status = recipe.dietaryStatus?.[preferredDiet];
    return status !== false;
  });
}

module.exports = {
  ALLERGENS,
  allergenLabels: labels,
  detectAllergens,
  filterForUser,
  parseAvoidedAllergens
};
