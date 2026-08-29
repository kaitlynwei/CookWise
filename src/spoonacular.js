const { cleanIngredientName, cleanPunctuation } = require("./text");
const {
  convertIngredientToUs,
  convertTextToUs,
  ingredientAmountsForStep
} = require("./recipe-format");
const { allergenLabels, detectAllergens } = require("./dietary");

const API_ORIGIN = "https://api.spoonacular.com";

function stripHtml(value) {
  return cleanPunctuation(
    String(value || "")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
  );
}

function conciseDescription(value) {
  const text = stripHtml(value);
  if (text.length <= 360) return text;
  const shortened = text.slice(0, 360);
  const lastSentence = Math.max(
    shortened.lastIndexOf("."),
    shortened.lastIndexOf("!"),
    shortened.lastIndexOf("?")
  );
  return lastSentence >= 120
    ? shortened.slice(0, lastSentence + 1)
    : shortened.slice(0, 357).trimEnd() + "...";
}

function validHttpUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function nutrient(recipe, name) {
  const item = recipe.nutrition?.nutrients?.find(
    (candidate) => candidate.name === name
  );
  return item ? Math.round(Number(item.amount) * 10) / 10 : 0;
}

function dishType(recipe) {
  if (recipe.dishTypes?.includes("dessert")) return "Sweet";
  if (recipe.dishTypes?.includes("breakfast")) return "Breakfast";
  return "Savory";
}

function difficulty(recipe, ingredientCount) {
  if (recipe.readyInMinutes <= 30 && ingredientCount <= 10) return "Easy";
  if (recipe.readyInMinutes <= 50 && ingredientCount <= 14) return "Medium";
  return "Hard";
}

function nutritionGuidance(recipe) {
  const sweet = recipe.dishType === "Sweet";
  const nutrition = recipe.macros;
  const notes = [];

  if (recipe.providerScore < 60) {
    notes.push("The provider score is below CookWise's preferred range, so review the source instructions before cooking.");
  }
  if (recipe.healthScore < (sweet ? 10 : 15)) {
    notes.push("The provider health score is lower than CookWise usually looks for. Pair this meal with fruit, vegetables, or another food that fits your needs.");
  }
  if (nutrition.calories > (sweet ? 500 : 800)) {
    notes.push("Calories are relatively high per serving, so consider a smaller serving if it fits your needs.");
  }
  if (nutrition.fat > (sweet ? 28 : 45)) {
    notes.push("Fat is relatively high per serving. A smaller portion or a substitution with less fat may help.");
  }
  if (nutrition.sugar > (sweet ? 35 : 25)) {
    notes.push("Sugar is relatively high per serving; consider reducing sweeteners or choosing a smaller serving.");
  }
  if (nutrition.sodium > 1000) {
    notes.push("Sodium is relatively high. Try packaged ingredients with less sodium or use less added salt.");
  }
  if (!sweet && nutrition.protein < 10) {
    notes.push("Protein is modest for a main meal; consider adding beans, eggs, tofu, fish, poultry, or another protein source.");
  }

  return notes;
}

async function requestJson(pathname, apiKey, options = {}) {
  if (!apiKey) throw new Error("SPOONACULAR_API_KEY is missing.");
  const fetchImpl = options.fetchImpl || fetch;
  const url = new URL(pathname, API_ORIGIN);
  Object.entries(options.parameters || {}).forEach(([name, value]) => {
    if (value !== "" && value !== undefined && value !== null) {
      url.searchParams.set(name, String(value));
    }
  });
  const response = await fetchImpl(url, {
    headers: { "x-api-key": apiKey }
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      "Spoonacular request failed (" + response.status + "): " +
        detail.slice(0, 200)
    );
  }
  return response.json();
}

async function fetchCatalogSearch(search, apiKey, number, offset, fetchImpl) {
  const data = await requestJson("/recipes/complexSearch", apiKey, {
    fetchImpl,
    parameters: {
      query: search.query,
      cuisine: search.cuisine,
      type: search.type,
      number,
      offset,
      sort: "popularity",
      sortDirection: "desc",
      instructionsRequired: "true",
      maxReadyTime: 90
    }
  });
  return Array.isArray(data.results) ? data.results : [];
}

async function fetchRecipeInformation(id, apiKey, fetchImpl) {
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) {
    throw new Error("A valid Spoonacular recipe ID is required.");
  }
  return requestJson("/recipes/" + Number(id) + "/information", apiKey, {
    fetchImpl,
    parameters: { includeNutrition: "true" }
  });
}

function normalizeCatalogRecipe(recipe) {
  const id = Number(recipe?.id);
  const title = stripHtml(recipe?.title);
  if (!Number.isInteger(id) || id <= 0 || !title) return null;
  return {
    id,
    title,
    imageUrl: validHttpUrl(recipe.image) ? recipe.image : ""
  };
}

function normalizeRecipeDetails(recipe) {
  const catalogRecipe = normalizeCatalogRecipe(recipe);
  if (!catalogRecipe) return null;

  const ingredients = (recipe.extendedIngredients || [])
    .filter((ingredient) =>
      Number.isFinite(Number(ingredient.amount)) && ingredient.name
    )
    .map((ingredient) => convertIngredientToUs({
      amount: Number(ingredient.measures?.us?.amount ?? ingredient.amount),
      unit: ingredient.measures?.us?.unitShort || ingredient.unit || "",
      name: cleanIngredientName(ingredient.name),
      original: stripHtml(ingredient.original)
    }));
  const steps = (recipe.analyzedInstructions || [])
    .flatMap((section) => section.steps || [])
    .map((step) => {
      const text = convertTextToUs(stripHtml(step.step));
      return {
        text,
        imageUrl: validHttpUrl(step.image || step.imageUrl)
          ? step.image || step.imageUrl
          : "",
        ingredientAmounts: ingredientAmountsForStep(text, ingredients)
      };
    })
    .filter((step) => step.text);
  const dietaryStatus = {
    vegetarian: Boolean(recipe.vegetarian),
    vegan: Boolean(recipe.vegan),
    "gluten-free": Boolean(recipe.glutenFree),
    "dairy-free": Boolean(recipe.dairyFree)
  };
  const allergens = detectAllergens(ingredients);
  const normalizedDishType = dishType(recipe);
  const macros = {
    calories: nutrient(recipe, "Calories"),
    protein: nutrient(recipe, "Protein"),
    carbohydrates: nutrient(recipe, "Carbohydrates"),
    fat: nutrient(recipe, "Fat"),
    fiber: nutrient(recipe, "Fiber"),
    sugar: nutrient(recipe, "Sugar"),
    sodium: nutrient(recipe, "Sodium")
  };
  const servings = Math.max(1, Number(recipe.servings) || 1);
  const sourceUrl = validHttpUrl(recipe.sourceUrl) ? recipe.sourceUrl : "";
  const sourceName = stripHtml(recipe.sourceName || recipe.creditsText) ||
    (sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : "Original recipe source");
  const normalized = {
    id: catalogRecipe.id,
    name: catalogRecipe.title,
    description: conciseDescription(recipe.summary) ||
      "Open the original source for additional recipe context.",
    cuisine: stripHtml(recipe.cuisines?.[0]) || "International",
    dishType: normalizedDishType,
    difficulty: difficulty(recipe, ingredients.length),
    cookTime: Math.max(0, Number(recipe.readyInMinutes) || 0),
    baseServings: servings,
    recommendedServings: servings,
    healthScore: Math.round(Number(recipe.healthScore) || 0),
    providerScore: Math.round(Number(recipe.spoonacularScore) || 0),
    popularityScore: Number(recipe.aggregateLikes) || 0,
    smartScore: 0,
    sourceName,
    sourceUrl,
    imageUrl: catalogRecipe.imageUrl,
    allergens,
    allergenLabels: allergens.map((allergen) => allergenLabels[allergen]),
    dietaryStatus,
    dietaryLabels: Object.entries(dietaryStatus)
      .filter(([, matches]) => matches)
      .map(([diet]) => diet.replace("-", " ")),
    macros,
    ingredients,
    steps
  };
  normalized.nutritionGuidance = nutritionGuidance(normalized);
  normalized.approvalLevel = normalized.nutritionGuidance.length
    ? "Approved with guidance"
    : "Approved";
  return normalized;
}

module.exports = {
  conciseDescription,
  difficulty,
  fetchCatalogSearch,
  fetchRecipeInformation,
  normalizeCatalogRecipe,
  normalizeRecipeDetails,
  nutritionGuidance,
  requestJson,
  stripHtml,
  validHttpUrl
};
