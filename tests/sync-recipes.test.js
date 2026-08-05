const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const {
  candidateCountFromArguments,
  difficulty,
  normalizeRecipe,
  nutritionGuidance,
  saveRecipes,
  stripHtml
} = require("../scripts/sync-recipes");

test("uses a 50-candidate default and accepts batches from 25 to 100", () => {
  assert.equal(candidateCountFromArguments([]), 50);
  assert.equal(candidateCountFromArguments(["--candidates=25"]), 25);
  assert.equal(candidateCountFromArguments(["--candidates=100"]), 100);
  assert.throws(
    () => candidateCountFromArguments(["--candidates=101"]),
    /between 25 and 100/
  );
  assert.throws(
    () => candidateCountFromArguments(["--candidates=50.5"]),
    /whole number/
  );
});

function sampleRecipe(overrides = {}) {
  return {
    id: 123,
    title: "Simple Mediterranean Bowl",
    summary: "<b>A balanced bowl</b> with practical ingredients.",
    sourceUrl: "https://example.com/mediterranean-bowl",
    sourceName: "Example Test Kitchen",
    servings: 4,
    readyInMinutes: 30,
    healthScore: 82,
    spoonacularScore: 91,
    aggregateLikes: 540,
    cuisines: ["Mediterranean"],
    dishTypes: ["main course"],
    extendedIngredients: [
      { amount: 2, unit: "cups", name: "chickpeas", original: "2 cups chickpeas" },
      { amount: 1, unit: "cup", name: "tomatoes", original: "1 cup tomatoes" },
      { amount: 1, unit: "cup", name: "cucumber", original: "1 cup cucumber" },
      { amount: 2, unit: "tbsp", name: "olive oil", original: "2 tbsp olive oil" },
      { amount: 1, unit: "", name: "lemon", original: "1 lemon" },
      { amount: 0.5, unit: "tsp", name: "salt", original: "1/2 tsp salt" }
    ],
    analyzedInstructions: [
      {
        steps: [
          { step: "Rinse the chickpeas." },
          { step: "Chop the vegetables." },
          { step: "Combine everything and serve." }
        ]
      }
    ],
    nutrition: {
      nutrients: [
        { name: "Calories", amount: 420 },
        { name: "Protein", amount: 18.4 },
        { name: "Carbohydrates", amount: 52.2 },
        { name: "Fat", amount: 16.1 },
        { name: "Fiber", amount: 11.3 },
        { name: "Sugar", amount: 7.2 },
        { name: "Sodium", amount: 410 }
      ]
    },
    ...overrides
  };
}

test("normalizes a highly rated practical recipe", () => {
  const recipe = normalizeRecipe(sampleRecipe(), {
    cuisine: "Mediterranean",
    type: "main course"
  });

  assert.equal(recipe.title, "Simple Mediterranean Bowl");
  assert.equal(recipe.dishType, "Savory");
  assert.equal(recipe.difficulty, "Easy");
  assert.equal(recipe.ingredients.length, 6);
  assert.equal(recipe.steps.length, 3);
  assert.equal(recipe.nutrition.protein, 18.4);
  assert.ok(recipe.smartScore > 70);
});

test("allows short ingredient lists but rejects more than 20 ingredients", () => {
  const shortRecipe = normalizeRecipe(
    sampleRecipe({
      extendedIngredients: [
        { amount: 1, unit: "cup", name: "beans", original: "1 cup beans" }
      ],
      analyzedInstructions: [{ steps: [{ step: "Heat and serve." }] }]
    }),
    { cuisine: "Mediterranean", type: "main course" }
  );
  assert.ok(shortRecipe);

  const ingredients = Array.from({ length: 21 }, (_, index) => ({
    amount: 1,
    unit: "cup",
    name: "ingredient " + index,
    original: "1 cup ingredient " + index
  }));
  const recipe = normalizeRecipe(
    sampleRecipe({ extendedIngredients: ingredients }),
    { cuisine: "Mediterranean", type: "main course" }
  );

  assert.equal(recipe, null);
});

test("keeps a lower health score with guidance", () => {
  const recipe = normalizeRecipe(sampleRecipe({ healthScore: 10 }), {
    cuisine: "Mediterranean",
    type: "main course"
  });

  assert.ok(recipe);
  assert.equal(recipe.nutrition.approvalLevel, "Approved with guidance");
  assert.ok(recipe.nutrition.guidance.some((note) => note.includes("health score")));
});

test("rejects only extreme macro estimates", () => {
  const recipe = sampleRecipe();
  recipe.nutrition.nutrients.find(
    (nutrient) => nutrient.name === "Calories"
  ).amount = 1600;

  assert.equal(
    normalizeRecipe(recipe, {
      cuisine: "Mediterranean",
      type: "main course"
    }),
    null
  );
});

test("adds practical guidance instead of rejecting a borderline meal", () => {
  const notes = nutritionGuidance({
    dishType: "Savory",
    providerScore: 75,
    healthScore: 50,
    nutrition: { calories: 900, protein: 7, fat: 30, sugar: 8, sodium: 1200 }
  });

  assert.ok(notes.some((note) => note.includes("Calories")));
  assert.ok(notes.some((note) => note.includes("Sodium")));
  assert.ok(notes.some((note) => note.includes("Protein")));
});

test("strips provider HTML and assigns difficulty", () => {
  assert.equal(stripHtml("<p>Simple &amp; clear</p>"), "Simple & clear");
  assert.equal(difficulty({ readyInMinutes: 55 }, 12), "Hard");
});

test("accumulates approved recipes and removes only unsafe stored recipes", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE recipes (
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
      synced_at TEXT NOT NULL
    );
  `);

  const first = normalizeRecipe(sampleRecipe({ id: 123 }), {
    cuisine: "Mediterranean",
    type: "main course"
  });
  const second = normalizeRecipe(
    sampleRecipe({ id: 124, title: "Second Approved Recipe" }),
    { cuisine: "Mediterranean", type: "main course" }
  );

  assert.deepEqual(saveRecipes(database, [first]), {
    added: 1,
    updated: 0,
    removed: 0,
    total: 1
  });
  assert.deepEqual(saveRecipes(database, [second]), {
    added: 1,
    updated: 0,
    removed: 0,
    total: 2
  });

  database
    .prepare("UPDATE recipes SET nutrition_json = ? WHERE id = ?")
    .run(
      JSON.stringify({
        calories: 1600,
        protein: 18,
        carbohydrates: 50,
        fat: 20,
        fiber: 8,
        sugar: 7,
        sodium: 400
      }),
      123
    );

  assert.deepEqual(saveRecipes(database, []), {
    added: 0,
    updated: 0,
    removed: 1,
    total: 1
  });
  assert.equal(
    database.prepare("SELECT title FROM recipes WHERE id = ?").get(124).title,
    "Second Approved Recipe"
  );
  database.close();
});
