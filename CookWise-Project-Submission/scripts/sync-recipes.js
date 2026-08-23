const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { cleanIngredientName, cleanPunctuation } = require("../src/text");
const { convertIngredientToUs } = require("../src/recipe-format");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIRECTORY = path.join(ROOT, "data");
const DATABASE_PATH = path.join(DATA_DIRECTORY, "cookwise.db");
const API_URL = "https://api.spoonacular.com/recipes/complexSearch";
const DEFAULT_CANDIDATE_COUNT = 50;
const MIN_CANDIDATE_COUNT = 25;
const MAX_CANDIDATE_COUNT = 100;

const searches = [
  {
    query: "chicken vegetable dinner",
    cuisine: "Italian",
    type: "main course"
  },
  {
    query: "bean tacos",
    cuisine: "Mexican",
    type: "main course"
  },
  {
    query: "chickpea curry",
    cuisine: "Indian",
    type: "main course"
  },
  {
    query: "Mediterranean dinner",
    cuisine: "Mediterranean",
    type: "main course"
  },
  {
    query: "vegetable stir fry",
    cuisine: "Asian",
    type: "main course"
  },
  {
    query: "lentil soup",
    cuisine: "Middle Eastern",
    type: "main course"
  },
  {
    query: "fish vegetables",
    cuisine: "",
    type: "main course"
  },
  { query: "fruit dessert", cuisine: "", type: "dessert" },
  { query: "oatmeal", cuisine: "", type: "breakfast" }
];

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

function nutrient(recipe, name) {
  const item = recipe.nutrition?.nutrients?.find(
    (candidate) => candidate.name === name
  );
  return item ? Math.round(Number(item.amount) * 10) / 10 : 0;
}

function instructions(recipe) {
  return (recipe.analyzedInstructions || [])
    .flatMap((section) => section.steps || [])
    .map((step) => ({
      text: stripHtml(step.step),
      imageUrl: validImageUrl(step.image || step.imageUrl)
        ? step.image || step.imageUrl
        : ""
    }))
    .filter((step) => step.text);
}

function validImageUrl(imageUrl) {
  if (!imageUrl) return false;
  try {
    const image = new URL(imageUrl);
    return image.protocol === "https:" || image.protocol === "http:";
  } catch {
    return false;
  }
}

function cuisineName(recipe, fallback) {
  return recipe.cuisines?.[0] || fallback || "International";
}

function dishType(recipe, fallback) {
  if (recipe.dishTypes?.includes("dessert") || fallback === "dessert") {
    return "Sweet";
  }
  if (recipe.dishTypes?.includes("breakfast")) return "Breakfast";
  return "Savory";
}

function difficulty(recipe, ingredientCount) {
  if (recipe.readyInMinutes <= 30 && ingredientCount <= 10) return "Easy";
  if (recipe.readyInMinutes <= 50 && ingredientCount <= 14) return "Medium";
  return "Hard";
}

function validSourceUrl(sourceUrl) {
  try {
    const source = new URL(sourceUrl);
    return source.protocol === "https:" || source.protocol === "http:";
  } catch {
    return false;
  }
}

function passesApproval(recipe) {
  const ingredientCount = recipe.ingredients?.length || 0;
  const stepCount = recipe.steps?.length || 0;
  const nutrition = recipe.nutrition || {};

  // Reject only incomplete recipes and clearly extreme nutrition estimates.
  // Less-than-ideal macros are retained with educational guidance instead.
  return Boolean(
    recipe.id &&
      recipe.title &&
      validSourceUrl(recipe.sourceUrl) &&
      recipe.servings &&
      recipe.readyMinutes >= 5 &&
      recipe.readyMinutes <= 90 &&
      ingredientCount >= 1 &&
      ingredientCount <= 20 &&
      stepCount >= 1 &&
      recipe.providerScore >= 40 &&
      nutrition.calories > 0 &&
      nutrition.calories <= 1500 &&
      nutrition.protein >= 0 &&
      nutrition.fat >= 0 &&
      nutrition.fat <= 100 &&
      nutrition.sugar >= 0 &&
      nutrition.sugar <= 100 &&
      nutrition.sodium >= 0 &&
      nutrition.sodium <= 2500
  );
}

function nutritionGuidance(recipe) {
  const sweet = recipe.dishType === "Sweet";
  const nutrition = recipe.nutrition || {};
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

function normalizeRecipe(recipe, search) {
  const steps = instructions(recipe);
  const ingredients = (recipe.extendedIngredients || [])
    .filter(
      (ingredient) =>
        Number.isFinite(Number(ingredient.amount)) && ingredient.name
    )
    .map((ingredient) => convertIngredientToUs({
      amount: Number(ingredient.measures?.us?.amount ?? ingredient.amount),
      unit: ingredient.measures?.us?.unitShort || ingredient.unit || "",
      name: cleanIngredientName(ingredient.name),
      original: stripHtml(ingredient.original)
    }));
  const ingredientCount = ingredients.length;
  const normalizedDishType = dishType(recipe, search.type);
  const healthScore = Number(recipe.healthScore || 0);
  const providerScore = Number(recipe.spoonacularScore || 0);
  const popularityScore = Number(recipe.aggregateLikes || 0);
  const calories = nutrient(recipe, "Calories");
  const protein = nutrient(recipe, "Protein");
  const fat = nutrient(recipe, "Fat");
  const sugar = nutrient(recipe, "Sugar");
  const sodium = nutrient(recipe, "Sodium");

  const approvalCandidate = {
    id: Number(recipe.id),
    title: stripHtml(recipe.title),
    sourceUrl: recipe.sourceUrl,
    servings: Number(recipe.servings),
    readyMinutes: Number(recipe.readyInMinutes),
    dishType: normalizedDishType,
    healthScore,
    providerScore,
    popularityScore,
    ingredients,
    steps,
    nutrition: { calories, protein, fat, sugar, sodium }
  };

  if (!passesApproval(approvalCandidate)) {
    return null;
  }

  const guidance = nutritionGuidance(approvalCandidate);
  const simplicityScore = Math.max(0, 20 - ingredientCount);
  const smartScore =
    providerScore * 0.45 +
    healthScore * 0.45 +
    simplicityScore * 1.5 +
    Math.min(5, Math.log10(popularityScore + 1) * 2);
  const sourceName =
    stripHtml(recipe.sourceName || recipe.creditsText) ||
    new URL(recipe.sourceUrl).hostname.replace(/^www\./, "");

  return {
    id: Number(recipe.id),
    title: stripHtml(recipe.title),
    description:
      conciseDescription(recipe.summary) ||
      "A highly ranked recipe selected for clear instructions and practical ingredients.",
    cuisine: cuisineName(recipe, search.cuisine),
    dishType: normalizedDishType,
    difficulty: difficulty(recipe, ingredientCount),
    readyMinutes: Number(recipe.readyInMinutes),
    servings: Number(recipe.servings),
    healthScore,
    providerScore,
    popularityScore,
    smartScore: Math.round(smartScore * 10) / 10,
    sourceName,
    sourceUrl: recipe.sourceUrl,
    imageUrl: validImageUrl(recipe.image) ? recipe.image : "",
    ingredients,
    steps,
    nutrition: {
      calories,
      protein,
      carbohydrates: nutrient(recipe, "Carbohydrates"),
      fat,
      fiber: nutrient(recipe, "Fiber"),
      sugar,
      sodium,
      dietary: {
        vegetarian: Boolean(recipe.vegetarian),
        vegan: Boolean(recipe.vegan),
        "gluten-free": Boolean(recipe.glutenFree),
        "dairy-free": Boolean(recipe.dairyFree)
      },
      approvalLevel: guidance.length
        ? "Approved with guidance"
        : "Approved",
      guidance
    }
  };
}

function candidateCountFromArguments(argumentsList = process.argv.slice(2)) {
  const option = argumentsList.find((argument) =>
    argument.startsWith("--candidates=")
  );

  if (!option) return DEFAULT_CANDIDATE_COUNT;

  const requested = Number(option.split("=")[1]);
  if (!Number.isInteger(requested)) {
    throw new Error("--candidates must be a whole number from 25 to 100.");
  }
  if (requested < MIN_CANDIDATE_COUNT || requested > MAX_CANDIDATE_COUNT) {
    throw new Error("--candidates must be between 25 and 100.");
  }

  return requested;
}

async function fetchSearch(search, apiKey, number, offset) {
  const url = new URL(API_URL);
  url.searchParams.set("query", search.query);
  if (search.cuisine) url.searchParams.set("cuisine", search.cuisine);
  url.searchParams.set("type", search.type);
  url.searchParams.set("number", String(number));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("sort", "popularity");
  url.searchParams.set("sortDirection", "desc");
  url.searchParams.set("instructionsRequired", "true");
  url.searchParams.set("addRecipeInformation", "true");
  url.searchParams.set("addRecipeNutrition", "true");
  url.searchParams.set("fillIngredients", "true");
  url.searchParams.set("maxReadyTime", "90");

  const response = await fetch(url, {
    headers: { "x-api-key": apiKey }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      "Spoonacular request failed (" +
        response.status +
        "): " +
        detail.slice(0, 200)
    );
  }

  const data = await response.json();
  return data.results || [];
}

function openDatabase() {
  fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
  const database = new DatabaseSync(DATABASE_PATH);
  database.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      cuisine TEXT NOT NULL,
      dish_type TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      ready_minutes INTEGER NOT NULL,
      servings INTEGER NOT NULL,
      health_score REAL NOT NULL,
      provider_score REAL NOT NULL,
      popularity_score INTEGER NOT NULL,
      smart_score REAL NOT NULL,
      source_name TEXT NOT NULL,
      source_url TEXT NOT NULL,
      ingredients_json TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      nutrition_json TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      synced_at TEXT NOT NULL
    );
  `);
  const columns = new Set(
    database.prepare("PRAGMA table_info(recipes)").all().map((column) => column.name)
  );
  if (!columns.has("image_url")) {
    database.exec("ALTER TABLE recipes ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
  }
  return database;
}

function saveRecipes(database, recipes) {
  const columns = new Set(
    database.prepare("PRAGMA table_info(recipes)").all().map((column) => column.name)
  );
  if (!columns.has("image_url")) {
    database.exec("ALTER TABLE recipes ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
  }
  const statement = database.prepare(`
    INSERT INTO recipes (
      id, title, description, cuisine, dish_type, difficulty,
      ready_minutes, servings, health_score, provider_score,
      popularity_score, smart_score, source_name, source_url,
      ingredients_json, steps_json, nutrition_json, image_url, synced_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      cuisine = excluded.cuisine,
      dish_type = excluded.dish_type,
      difficulty = excluded.difficulty,
      ready_minutes = excluded.ready_minutes,
      servings = excluded.servings,
      health_score = excluded.health_score,
      provider_score = excluded.provider_score,
      popularity_score = excluded.popularity_score,
      smart_score = excluded.smart_score,
      source_name = excluded.source_name,
      source_url = excluded.source_url,
      ingredients_json = excluded.ingredients_json,
      steps_json = excluded.steps_json,
      nutrition_json = excluded.nutrition_json,
      image_url = excluded.image_url,
      synced_at = excluded.synced_at
  `);
  const deleteStatement = database.prepare("DELETE FROM recipes WHERE id = ?");
  const syncedAt = new Date().toISOString();
  const existingRows = database.prepare("SELECT * FROM recipes").all();
  const existingIds = new Set(existingRows.map((row) => Number(row.id)));
  const rejectedIds = existingRows
    .filter((row) => {
      try {
        return !passesApproval({
          id: Number(row.id),
          title: row.title,
          sourceUrl: row.source_url,
          servings: Number(row.servings),
          readyMinutes: Number(row.ready_minutes),
          dishType: row.dish_type,
          healthScore: Number(row.health_score),
          providerScore: Number(row.provider_score),
          popularityScore: Number(row.popularity_score),
          ingredients: JSON.parse(row.ingredients_json),
          steps: JSON.parse(row.steps_json),
          nutrition: JSON.parse(row.nutrition_json)
        });
      } catch {
        return true;
      }
    })
    .map((row) => Number(row.id));
  const approvedRecipes = recipes.filter(passesApproval);
  let added = 0;
  let updated = 0;

  database.exec("BEGIN");
  try {
    rejectedIds.forEach((id) => deleteStatement.run(id));
    approvedRecipes.forEach((recipe) => {
      if (existingIds.has(recipe.id)) {
        updated += 1;
      } else {
        added += 1;
      }
      statement.run(
        recipe.id,
        recipe.title,
        recipe.description,
        recipe.cuisine,
        recipe.dishType,
        recipe.difficulty,
        recipe.readyMinutes,
        recipe.servings,
        recipe.healthScore,
        recipe.providerScore,
        recipe.popularityScore,
        recipe.smartScore,
        recipe.sourceName,
        recipe.sourceUrl,
        JSON.stringify(recipe.ingredients),
        JSON.stringify(recipe.steps),
        JSON.stringify(recipe.nutrition),
        recipe.imageUrl || "",
        syncedAt
      );
    });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  const total = database.prepare("SELECT COUNT(*) AS count FROM recipes").get()
    .count;
  return { added, updated, removed: rejectedIds.length, total };
}

async function syncRecipes() {
  const apiKey = process.env.SPOONACULAR_API_KEY;
  if (!apiKey) {
    throw new Error(
      "SPOONACULAR_API_KEY is missing. Copy .env.example to .env and add your free Spoonacular API key."
    );
  }

  const candidateTarget = candidateCountFromArguments();
  const selected = new Map();
  let reviewed = 0;
  const runOffset = Math.floor(Math.random() * 21);

  for (const [index, search] of searches.entries()) {
    const searchesRemaining = searches.length - index;
    const candidatesRemaining = candidateTarget - reviewed;
    const requestedForSearch = Math.ceil(
      candidatesRemaining / searchesRemaining
    );
    const results = await fetchSearch(
      search,
      apiKey,
      requestedForSearch,
      runOffset + index
    );
    reviewed += results.length;
    results
      .map((recipe) => normalizeRecipe(recipe, search))
      .filter(Boolean)
      .forEach((recipe) => {
        const existing = selected.get(recipe.id);
        if (!existing || recipe.smartScore > existing.smartScore) {
          selected.set(recipe.id, recipe);
        }
      });
  }

  const recipes = [...selected.values()].sort(
    (first, second) => second.smartScore - first.smartScore
  );

  if (recipes.length === 0) {
    throw new Error(
      "No recipes passed the CookWise recipe checks. The saved collection was not changed."
    );
  }

  const database = openDatabase();
  const result = saveRecipes(database, recipes);
  database.close();
  console.log(
    "Recipe sync complete: " + reviewed + " candidates reviewed, " +
      recipes.length + " approved, " +
      result.added +
      " added, " +
      result.updated +
      " updated, " +
      result.removed +
      " removed by safety filters, " +
      result.total +
      " total."
  );
}

if (require.main === module) {
  syncRecipes().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  candidateCountFromArguments,
  difficulty,
  normalizeRecipe,
  nutritionGuidance,
  passesApproval,
  saveRecipes,
  stripHtml,
  conciseDescription
};
