const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  fetchCatalogSearch,
  normalizeCatalogRecipe
} = require("./spoonacular");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIRECTORY = path.join(ROOT, "data");
const DATABASE_PATH = process.env.COOKWISE_DATABASE_PATH ||
  path.join(DATA_DIRECTORY, "cookwise.db");
const SEED_PATH = path.join(ROOT, "seed", "recipe-catalog-seed.json");
const DEFAULT_CANDIDATE_COUNT = 50;
const MIN_CANDIDATE_COUNT = 25;
const MAX_CANDIDATE_COUNT = 100;
const SEARCHES_PER_REFRESH = 9;
const MAX_SEARCH_OFFSET = 200;
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const REFRESH_LEASE_MS = 30 * 60 * 1000;
const LAST_REFRESH_KEY = "last_catalog_refresh_at";
const REFRESH_LOCK_KEY = "catalog_refresh_lock_until";

const searches = [
  { query: "chicken vegetable dinner", cuisine: "Italian", type: "main course" },
  { query: "bean tacos", cuisine: "Mexican", type: "main course" },
  { query: "chickpea curry", cuisine: "Indian", type: "main course" },
  { query: "Mediterranean grain bowl", cuisine: "Mediterranean", type: "main course" },
  { query: "vegetable stir fry", cuisine: "Asian", type: "main course" },
  { query: "lentil soup", cuisine: "Middle Eastern", type: "main course" },
  { query: "rice bowl vegetables", cuisine: "Japanese", type: "main course" },
  { query: "vegetable rice bowl", cuisine: "Korean", type: "main course" },
  { query: "noodles vegetables", cuisine: "Thai", type: "main course" },
  { query: "noodle soup", cuisine: "Vietnamese", type: "main course" },
  { query: "chicken salad", cuisine: "Greek", type: "main course" },
  { query: "vegetable dinner", cuisine: "French", type: "main course" },
  { query: "chicken rice", cuisine: "Caribbean", type: "main course" },
  { query: "fish dinner", cuisine: "Latin American", type: "main course" },
  { query: "peanut stew vegetables", cuisine: "African", type: "main course" },
  { query: "sheet pan chicken vegetables", cuisine: "American", type: "main course" },
  { query: "fish vegetables", cuisine: "", type: "main course" },
  { query: "one pot vegetarian dinner", cuisine: "", type: "main course" },
  { query: "tofu vegetables", cuisine: "Asian", type: "main course" },
  { query: "eggs vegetables", cuisine: "", type: "breakfast" },
  { query: "oatmeal fruit", cuisine: "", type: "breakfast" },
  { query: "yogurt breakfast", cuisine: "", type: "breakfast" },
  { query: "fruit dessert", cuisine: "", type: "dessert" },
  { query: "baked fruit dessert", cuisine: "", type: "dessert" },
  { query: "chocolate dessert", cuisine: "", type: "dessert" },
  { query: "savory snack", cuisine: "", type: "appetizer" },
  { query: "vegetable soup", cuisine: "", type: "soup" },
  { query: "bean salad", cuisine: "", type: "salad" }
];

let inProcessRefresh = null;

function tableExists(database, name) {
  return Boolean(
    database.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
    ).get(name)
  );
}

function tableCount(database, name) {
  return tableExists(database, name)
    ? Number(database.prepare("SELECT COUNT(*) AS count FROM " + name).get().count)
    : null;
}

function userDataCounts(database) {
  return {
    users: tableCount(database, "users"),
    sessions: tableCount(database, "sessions"),
    cooking_history: tableCount(database, "cooking_history")
  };
}

function sameCounts(first, second) {
  return Object.keys(first).every((key) => first[key] === second[key]);
}

function ensureMinimalRecipeTable(database) {
  if (!tableExists(database, "recipes")) {
    database.exec(`
      CREATE TABLE recipes (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        image_url TEXT NOT NULL DEFAULT ''
      );
    `);
    return { migrated: false, preservedRecipes: 0 };
  }

  const columns = database.prepare("PRAGMA table_info(recipes)").all();
  const names = columns.map((column) => column.name);
  const allowed = new Set(["id", "title", "image_url"]);
  if (names.length === allowed.size && names.every((name) => allowed.has(name))) {
    return {
      migrated: false,
      preservedRecipes: tableCount(database, "recipes")
    };
  }
  if (!names.includes("id") || !names.includes("title")) {
    throw new Error("The recipes table cannot be safely migrated because ID or title is missing.");
  }

  const beforeUserData = userDataCounts(database);
  const beforeRecipeCount = tableCount(database, "recipes");
  const imageExpression = names.includes("image_url")
    ? "COALESCE(image_url, '')"
    : "''";

  database.exec("PRAGMA foreign_keys = OFF");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec("DROP TABLE IF EXISTS recipes_catalog_migration");
    database.exec(`
      CREATE TABLE recipes_catalog_migration (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        image_url TEXT NOT NULL DEFAULT ''
      );
    `);
    database.exec(`
      INSERT INTO recipes_catalog_migration (id, title, image_url)
      SELECT id, title, ${imageExpression}
      FROM recipes;
    `);
    const preserved = tableCount(database, "recipes_catalog_migration");
    if (preserved !== beforeRecipeCount) {
      throw new Error("The recipe catalog migration did not preserve every recipe ID.");
    }
    if (!sameCounts(beforeUserData, userDataCounts(database))) {
      throw new Error("The recipe catalog migration attempted to change user data.");
    }
    database.exec("DROP TABLE recipes");
    database.exec("ALTER TABLE recipes_catalog_migration RENAME TO recipes");
    if (!sameCounts(beforeUserData, userDataCounts(database))) {
      throw new Error("User data changed during the recipe catalog migration.");
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }

  const foreignKeyProblems = database.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeyProblems.length) {
    throw new Error("The recipe catalog migration left an invalid database relationship.");
  }
  return { migrated: true, preservedRecipes: beforeRecipeCount };
}

function validSeedImageUrl(value) {
  if (value === "") return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function validateSeedCatalog(entries) {
  if (!Array.isArray(entries)) {
    throw new Error("The recipe catalog seed must be a JSON array.");
  }
  const ids = new Set();
  entries.forEach((entry) => {
    const keys = Object.keys(entry || {}).sort();
    if (keys.join(",") !== "id,imageUrl,title") {
      throw new Error("Each seed recipe must contain only id, title, and imageUrl.");
    }
    if (!Number.isInteger(entry.id) || entry.id <= 0) {
      throw new Error("Each seed recipe must have a positive integer ID.");
    }
    if (typeof entry.title !== "string" || !entry.title.trim()) {
      throw new Error("Each seed recipe must have a title.");
    }
    if (typeof entry.imageUrl !== "string" || !validSeedImageUrl(entry.imageUrl)) {
      throw new Error("Each seed recipe image URL must be empty or use HTTP or HTTPS.");
    }
    if (ids.has(entry.id)) {
      throw new Error("The recipe catalog seed contains a duplicate recipe ID.");
    }
    ids.add(entry.id);
  });
  return entries;
}

function loadSeedCatalog(seedPath = SEED_PATH) {
  return validateSeedCatalog(JSON.parse(fs.readFileSync(seedPath, "utf8")));
}

function seedCatalog(database, entries = loadSeedCatalog()) {
  const recipes = validateSeedCatalog(entries);
  const insert = database.prepare(`
    INSERT OR IGNORE INTO recipes (id, title, image_url)
    VALUES (?, ?, ?)
  `);
  const before = Number(
    database.prepare("SELECT COUNT(*) AS count FROM recipes").get().count
  );
  database.exec("BEGIN IMMEDIATE");
  try {
    recipes.forEach((recipe) => {
      insert.run(recipe.id, recipe.title, recipe.imageUrl);
    });
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  const total = Number(
    database.prepare("SELECT COUNT(*) AS count FROM recipes").get().count
  );
  return { added: total - before, total };
}

function ensureSyncStateTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS recipe_sync_state (
      state_key TEXT PRIMARY KEY,
      state_value INTEGER NOT NULL
    );
  `);
}

function stateValue(database, key, fallback = 0) {
  ensureSyncStateTable(database);
  const row = database.prepare(
    "SELECT state_value FROM recipe_sync_state WHERE state_key = ?"
  ).get(key);
  return row ? Number(row.state_value) : fallback;
}

function setStateValue(database, key, value) {
  ensureSyncStateTable(database);
  database.prepare(`
    INSERT INTO recipe_sync_state (state_key, state_value)
    VALUES (?, ?)
    ON CONFLICT(state_key) DO UPDATE SET state_value = excluded.state_value
  `).run(key, Math.trunc(value));
}

function searchKey(search) {
  return [search.query, search.cuisine, search.type]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");
}

function selectSearchBatch(database, pool = searches, count = SEARCHES_PER_REFRESH) {
  if (!pool.length) return [];
  const cursor = stateValue(database, "search_cursor") % pool.length;
  const batchSize = Math.min(count, pool.length);
  return Array.from(
    { length: batchSize },
    (_, index) => pool[(cursor + index) % pool.length]
  );
}

function getSearchOffset(database, search) {
  return stateValue(database, "offset:" + searchKey(search));
}

function nextSearchOffset(currentOffset, requested, received) {
  if (received === 0) return 0;
  const next = currentOffset + Math.max(requested, received);
  return next >= MAX_SEARCH_OFFSET ? 0 : next;
}

function candidateCountFromArguments(argumentsList = process.argv.slice(2)) {
  const option = argumentsList.find((argument) => argument.startsWith("--candidates="));
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

function saveCatalogRefresh(database, recipes, batch, offsetUpdates, refreshedAt) {
  const insert = database.prepare(`
    INSERT OR IGNORE INTO recipes (id, title, image_url)
    VALUES (?, ?, ?)
  `);
  const existingIds = new Set(
    database.prepare("SELECT id FROM recipes").all().map((row) => Number(row.id))
  );
  let added = 0;
  let updated = 0;

  database.exec("BEGIN IMMEDIATE");
  try {
    recipes.forEach((recipe) => {
      if (!existingIds.has(recipe.id)) added += 1;
      insert.run(recipe.id, recipe.title, recipe.imageUrl || "");
    });
    const cursor = stateValue(database, "search_cursor");
    setStateValue(database, "search_cursor", cursor + batch.length);
    offsetUpdates.forEach(({ search, offset }) => {
      setStateValue(database, "offset:" + searchKey(search), offset);
    });
    setStateValue(database, LAST_REFRESH_KEY, refreshedAt);
    setStateValue(database, REFRESH_LOCK_KEY, 0);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  const total = Number(database.prepare("SELECT COUNT(*) AS count FROM recipes").get().count);
  return { added, updated, total };
}

function acquireRefreshLease(database, now, leaseMs = REFRESH_LEASE_MS) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const lockUntil = stateValue(database, REFRESH_LOCK_KEY);
    if (lockUntil > now) {
      database.exec("COMMIT");
      return false;
    }
    setStateValue(database, REFRESH_LOCK_KEY, now + leaseMs);
    database.exec("COMMIT");
    return true;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function releaseRefreshLease(database) {
  setStateValue(database, REFRESH_LOCK_KEY, 0);
}

function lastSuccessfulRefresh(database) {
  return stateValue(database, LAST_REFRESH_KEY);
}

function refreshIsDue(database, now = Date.now()) {
  const lastRefresh = lastSuccessfulRefresh(database);
  return !lastRefresh || now - lastRefresh >= REFRESH_INTERVAL_MS;
}

async function refreshCatalog(options) {
  const {
    database,
    apiKey,
    candidateTarget = DEFAULT_CANDIDATE_COUNT,
    fetchImpl,
    now = Date.now()
  } = options;
  const selected = new Map();
  const batch = selectSearchBatch(database);
  const offsetUpdates = [];
  let reviewed = 0;

  for (const [index, search] of batch.entries()) {
    if (reviewed >= candidateTarget) break;
    const remainingSearches = batch.length - index;
    const remainingCandidates = candidateTarget - reviewed;
    const requested = Math.ceil(remainingCandidates / remainingSearches);
    const offset = getSearchOffset(database, search);
    const results = await fetchCatalogSearch(
      search,
      apiKey,
      requested,
      offset,
      fetchImpl
    );
    reviewed += results.length;
    offsetUpdates.push({
      search,
      offset: nextSearchOffset(offset, requested, results.length)
    });
    results.map(normalizeCatalogRecipe).filter(Boolean).forEach((recipe) => {
      selected.set(recipe.id, recipe);
    });
  }

  const recipes = [...selected.values()];
  if (!recipes.length) {
    throw new Error("Spoonacular returned no usable catalog recipes.");
  }
  const saved = saveCatalogRefresh(database, recipes, batch, offsetUpdates, now);
  return { ...saved, reviewed, received: recipes.length, topics: batch.length };
}

async function runCatalogRefresh(options) {
  if (inProcessRefresh) return inProcessRefresh;
  inProcessRefresh = (async () => {
    const { database, apiKey, force = false, now = Date.now() } = options;
    if (!apiKey) return { status: "skipped", reason: "missing-api-key" };
    if (!force && !refreshIsDue(database, now)) {
      return { status: "skipped", reason: "not-due" };
    }
    if (!acquireRefreshLease(database, now)) {
      return { status: "skipped", reason: "already-running" };
    }
    try {
      if (!force && !refreshIsDue(database, now)) {
        releaseRefreshLease(database);
        return { status: "skipped", reason: "not-due" };
      }
      const result = await refreshCatalog(options);
      return { status: "refreshed", ...result };
    } catch (error) {
      releaseRefreshLease(database);
      throw error;
    }
  })();
  try {
    return await inProcessRefresh;
  } finally {
    inProcessRefresh = null;
  }
}

function openCatalogDatabase(databasePath = DATABASE_PATH) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  ensureMinimalRecipeTable(database);
  seedCatalog(database);
  ensureSyncStateTable(database);
  return database;
}

module.exports = {
  DATABASE_PATH,
  DEFAULT_CANDIDATE_COUNT,
  LAST_REFRESH_KEY,
  REFRESH_INTERVAL_MS,
  REFRESH_LOCK_KEY,
  SEED_PATH,
  acquireRefreshLease,
  candidateCountFromArguments,
  ensureMinimalRecipeTable,
  ensureSyncStateTable,
  getSearchOffset,
  lastSuccessfulRefresh,
  loadSeedCatalog,
  nextSearchOffset,
  openCatalogDatabase,
  refreshCatalog,
  refreshIsDue,
  releaseRefreshLease,
  runCatalogRefresh,
  seedCatalog,
  saveCatalogRefresh,
  searches,
  searchKey,
  selectSearchBatch,
  stateValue,
  validateSeedCatalog
};
