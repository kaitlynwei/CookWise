const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const {
  LAST_REFRESH_KEY,
  REFRESH_INTERVAL_MS,
  SEED_PATH,
  acquireRefreshLease,
  ensureMinimalRecipeTable,
  ensureSyncStateTable,
  lastSuccessfulRefresh,
  loadSeedCatalog,
  refreshIsDue,
  releaseRefreshLease,
  runCatalogRefresh,
  seedCatalog,
  stateValue
} = require("../src/recipe-catalog");
const {
  fetchRecipeInformation,
  requestJson
} = require("../src/spoonacular");
const { startCatalogScheduler } = require("../src/recipe-scheduler");

function legacyDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL);
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL);
    CREATE TABLE recipes (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      cuisine TEXT NOT NULL,
      ingredients_json TEXT NOT NULL,
      nutrition_json TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE cooking_history (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      recipe_id INTEGER NOT NULL
    );
    INSERT INTO users (id, username) VALUES (1, 'cook');
    INSERT INTO sessions (token_hash, user_id) VALUES ('token', 1);
    INSERT INTO recipes (
      id, title, description, cuisine, ingredients_json, nutrition_json, image_url
    ) VALUES (
      77, 'Preserved Recipe', 'Remove me', 'Italian', '[{"name":"pasta"}]',
      '{"calories":500}', 'https://example.com/recipe.jpg'
    );
    INSERT INTO cooking_history (id, user_id, recipe_id) VALUES (1, 1, 77);
  `);
  return database;
}

function catalogDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE recipes (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT ''
    );
  `);
  ensureSyncStateTable(database);
  return database;
}

test("tracked seed contains 232 recipes with exactly the permitted fields", () => {
  const seed = loadSeedCatalog(SEED_PATH);
  assert.equal(seed.length, 232);
  seed.forEach((recipe) => {
    assert.deepEqual(Object.keys(recipe).sort(), ["id", "imageUrl", "title"]);
  });
});

test("catalog seeding is idempotent and does not overwrite production entries", () => {
  const database = catalogDatabase();
  const seed = loadSeedCatalog(SEED_PATH);
  const existing = seed[0];
  database.prepare(`
    INSERT INTO recipes (id, title, image_url)
    VALUES (?, ?, ?)
  `).run(existing.id, "Production title", "https://example.com/production.jpg");

  const first = seedCatalog(database, seed);
  const second = seedCatalog(database, seed);
  const preserved = database.prepare(
    "SELECT title, image_url FROM recipes WHERE id = ?"
  ).get(existing.id);

  assert.deepEqual(first, { added: 231, total: 232 });
  assert.deepEqual(second, { added: 0, total: 232 });
  assert.equal(preserved.title, "Production title");
  assert.equal(preserved.image_url, "https://example.com/production.jpg");
  database.close();
});

test("migration removes only Spoonacular detail fields and preserves user data", () => {
  const database = legacyDatabase();
  const result = ensureMinimalRecipeTable(database);
  assert.equal(result.migrated, true);
  assert.deepEqual(
    database.prepare("PRAGMA table_info(recipes)").all().map((column) => column.name),
    ["id", "title", "image_url"]
  );
  assert.deepEqual(
    { ...database.prepare("SELECT * FROM recipes").get() },
    {
      id: 77,
      title: "Preserved Recipe",
      image_url: "https://example.com/recipe.jpg"
    }
  );
  assert.equal(database.prepare("SELECT username FROM users").get().username, "cook");
  assert.equal(database.prepare("SELECT token_hash FROM sessions").get().token_hash, "token");
  assert.equal(database.prepare("SELECT recipe_id FROM cooking_history").get().recipe_id, 77);
  database.close();
});

test("refresh leases prevent overlapping jobs and can be released", () => {
  const database = catalogDatabase();
  assert.equal(acquireRefreshLease(database, 1_000), true);
  assert.equal(acquireRefreshLease(database, 1_001), false);
  releaseRefreshLease(database);
  assert.equal(acquireRefreshLease(database, 1_002), true);
  database.close();
});

test("successful refresh time persists and prevents restart-style duplicate calls", async () => {
  const database = catalogDatabase();
  database.prepare(`
    INSERT INTO recipes (id, title, image_url)
    VALUES (1000, 'Existing production recipe', 'https://example.com/existing.jpg')
  `).run();
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls += 1;
    assert.equal(options.headers["x-api-key"], "private-key");
    assert.equal(url.searchParams.has("apiKey"), false);
    const number = Number(url.searchParams.get("number"));
    const start = calls * 1_000;
    return {
      ok: true,
      async json() {
        return {
          results: Array.from({ length: number }, (_, index) => ({
            id: start + index,
            title: "Recipe " + (start + index),
            image: "https://example.com/" + (start + index) + ".jpg",
            nutrition: { shouldNotBeStored: true }
          }))
        };
      }
    };
  };
  const now = 10_000;
  const first = await runCatalogRefresh({
    database,
    apiKey: "private-key",
    fetchImpl,
    candidateTarget: 25,
    now
  });
  assert.equal(first.status, "refreshed");
  assert.equal(lastSuccessfulRefresh(database), now);
  assert.equal(
    database.prepare("SELECT title FROM recipes WHERE id = 1000").get().title,
    "Existing production recipe"
  );
  const callsAfterFirst = calls;
  const second = await runCatalogRefresh({
    database,
    apiKey: "private-key",
    fetchImpl,
    candidateTarget: 25,
    now: now + 1_000
  });
  assert.deepEqual(second, { status: "skipped", reason: "not-due" });
  assert.equal(calls, callsAfterFirst);
  assert.equal(refreshIsDue(database, now + REFRESH_INTERVAL_MS - 1), false);
  assert.equal(refreshIsDue(database, now + REFRESH_INTERVAL_MS), true);
  assert.equal(stateValue(database, LAST_REFRESH_KEY), now);
  assert.deepEqual(
    database.prepare("PRAGMA table_info(recipes)").all().map((column) => column.name),
    ["id", "title", "image_url"]
  );
  database.close();
});

test("recipe details are fetched every time and never cached by the client", async () => {
  let calls = 0;
  const seenUrls = [];
  const fetchImpl = async (url, options) => {
    calls += 1;
    seenUrls.push(String(url));
    assert.equal(options.headers["x-api-key"], "private-key");
    return {
      ok: true,
      async json() {
        return { id: 77, title: "Fresh Recipe" };
      }
    };
  };
  await fetchRecipeInformation(77, "private-key", fetchImpl);
  await fetchRecipeInformation(77, "private-key", fetchImpl);
  assert.equal(calls, 2);
  assert.ok(seenUrls.every((url) => !url.includes("private-key")));
});

test("server requests keep the Spoonacular key out of the URL", async () => {
  let observed;
  await requestJson("/recipes/1/information", "secret", {
    fetchImpl: async (url, options) => {
      observed = { url: String(url), headers: options.headers };
      return { ok: true, async json() { return { id: 1 }; } };
    }
  });
  assert.equal(observed.url.includes("secret"), false);
  assert.equal(observed.headers["x-api-key"], "secret");
});

test("automatic scheduler checks due state instead of refreshing every check", async () => {
  const database = catalogDatabase();
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    const number = Number(url.searchParams.get("number"));
    return {
      ok: true,
      async json() {
        return {
          results: Array.from({ length: number }, (_, index) => ({
            id: calls * 10_000 + index,
            title: "Scheduled Recipe " + index,
            image: "https://example.com/scheduled-" + index + ".jpg"
          }))
        };
      }
    };
  };
  const scheduler = startCatalogScheduler({
    database,
    apiKey: "private-key",
    fetchImpl,
    startDelayMs: 60_000,
    checkIntervalMs: 60_000,
    logger: { log() {}, error() {} }
  });
  const first = await scheduler.checkNow();
  const callsAfterFirst = calls;
  const second = await scheduler.checkNow();
  scheduler.stop();
  assert.equal(first.status, "refreshed");
  assert.deepEqual(second, { status: "skipped", reason: "not-due" });
  assert.equal(calls, callsAfterFirst);
  database.close();
});
