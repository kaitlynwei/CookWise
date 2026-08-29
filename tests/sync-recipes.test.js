const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const {
  candidateCountFromArguments,
  getSearchOffset,
  nextSearchOffset,
  saveCatalogRefresh,
  searches,
  selectSearchBatch
} = require("../src/recipe-catalog");
const {
  normalizeCatalogRecipe,
  normalizeRecipeDetails,
  stripHtml
} = require("../src/spoonacular");

function minimalDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE recipes (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT ''
    );
  `);
  return database;
}

test("uses a 50-candidate default and accepts batches from 25 to 100", () => {
  assert.equal(candidateCountFromArguments([]), 50);
  assert.equal(candidateCountFromArguments(["--candidates=25"]), 25);
  assert.equal(candidateCountFromArguments(["--candidates=100"]), 100);
  assert.throws(
    () => candidateCountFromArguments(["--candidates=24"]),
    /between 25 and 100/
  );
  assert.throws(
    () => candidateCountFromArguments(["--candidates=50.5"]),
    /whole number/
  );
});

test("rotates through catalog searches and remembers offsets", () => {
  const database = minimalDatabase();
  assert.ok(searches.length >= 25);
  const firstBatch = selectSearchBatch(database, searches, 3);
  saveCatalogRefresh(
    database,
    [{ id: 1, title: "Recipe", imageUrl: "https://example.com/1.jpg" }],
    firstBatch,
    [{ search: firstBatch[0], offset: 12 }],
    1_000
  );
  assert.deepEqual(selectSearchBatch(database, searches, 3), searches.slice(3, 6));
  assert.equal(getSearchOffset(database, firstBatch[0]), 12);
  assert.equal(nextSearchOffset(20, 10, 10), 30);
  assert.equal(nextSearchOffset(20, 10, 0), 0);
  assert.equal(nextSearchOffset(195, 10, 5), 0);
  database.close();
});

test("catalog normalization retains only permitted Spoonacular fields", () => {
  assert.deepEqual(
    normalizeCatalogRecipe({
      id: 123,
      title: "<b>Simple Bowl</b>",
      image: "https://example.com/bowl.jpg",
      readyInMinutes: 30,
      sourceUrl: "https://example.com/full-recipe",
      nutrition: { nutrients: [{ name: "Protein", amount: 20 }] }
    }),
    {
      id: 123,
      title: "Simple Bowl",
      imageUrl: "https://example.com/bowl.jpg"
    }
  );
});

test("on-demand detail normalization includes the original source attribution", () => {
  const recipe = normalizeRecipeDetails({
    id: 123,
    title: "Simple Bowl",
    image: "https://example.com/bowl.jpg",
    summary: "<p>A practical bowl.</p>",
    sourceName: "Example Test Kitchen",
    sourceUrl: "https://example.com/original-bowl",
    servings: 2,
    readyInMinutes: 25,
    spoonacularScore: 88,
    healthScore: 75,
    cuisines: ["Mediterranean"],
    dishTypes: ["main course"],
    extendedIngredients: [
      {
        amount: 1,
        unit: "cup",
        name: "chickpeas",
        original: "1 cup chickpeas",
        measures: { us: { amount: 1, unitShort: "cup" } }
      }
    ],
    analyzedInstructions: [{ steps: [{ step: "Add 1 cup chickpeas." }] }],
    nutrition: {
      nutrients: [
        { name: "Calories", amount: 400 },
        { name: "Protein", amount: 18 },
        { name: "Carbohydrates", amount: 50 },
        { name: "Fat", amount: 12 },
        { name: "Fiber", amount: 9 },
        { name: "Sugar", amount: 5 },
        { name: "Sodium", amount: 350 }
      ]
    }
  });
  assert.equal(recipe.sourceName, "Example Test Kitchen");
  assert.equal(recipe.sourceUrl, "https://example.com/original-bowl");
  assert.equal(recipe.ingredients.length, 1);
  assert.equal(recipe.steps.length, 1);
  assert.equal(recipe.macros.protein, 18);
  assert.equal(stripHtml("<p>Simple &amp; clear</p>"), "Simple & clear");
});
