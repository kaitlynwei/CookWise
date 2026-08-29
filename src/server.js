const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual
} = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { achievementSummary } = require("./achievements");
const { cleanIngredientName, cleanPunctuation } = require("./text");
const {
  convertIngredientToUs,
  convertTextToUs,
  ingredientAmountsForStep
} = require("./recipe-format");
const {
  ALLERGENS,
  allergenLabels,
  detectAllergens,
  filterForUser,
  parseAvoidedAllergens
} = require("./dietary");
const { proteinTargetRange } = require("./nutrition-guidance");
const {
  hasPreferences,
  personalizeRecipes,
  preferenceScore
} = require("./preferences");
const {
  centimetersToFeetAndInches,
  feetAndInchesToCentimeters,
  kilogramsToPounds,
  poundsToKilograms
} = require("./units");
const {
  dailyMotivation,
  dailyRecipeIndex,
  recommendationReason,
  rotateRecipes
} = require("./recommendations");

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 8080);
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIRECTORY = path.join(ROOT, "public");
const VIEWS_DIRECTORY = path.join(__dirname, "views");
const DATA_DIRECTORY = path.join(ROOT, "data");
const DATABASE_PATH = path.join(DATA_DIRECTORY, "cookwise.db");
const SESSION_LENGTH_SECONDS = 60 * 60 * 24 * 7;
const MAX_BODY_BYTES = 20_000;

fs.mkdirSync(DATA_DIRECTORY, { recursive: true });

const database = new DatabaseSync(DATABASE_PATH);
database.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    name TEXT,
    height_cm REAL,
    weight_kg REAL,
    gender TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS sessions_user_id
    ON sessions(user_id);

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

  CREATE INDEX IF NOT EXISTS recipes_smart_score
    ON recipes(smart_score DESC);
  CREATE INDEX IF NOT EXISTS recipes_cuisine
    ON recipes(cuisine);

  CREATE TABLE IF NOT EXISTS cooking_history (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    recipe_id INTEGER NOT NULL,
    cooked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS cooking_history_user
    ON cooking_history(user_id, cooked_at DESC);
  CREATE INDEX IF NOT EXISTS cooking_history_user_recipe
    ON cooking_history(user_id, recipe_id);
`);

const userColumns = new Set(
  database.prepare("PRAGMA table_info(users)").all().map((column) => column.name)
);
[
  ["preferred_servings", "INTEGER"],
  ["preferred_cuisine", "TEXT"],
  ["preferred_max_cook_time", "INTEGER"],
  ["preferred_min_protein", "REAL"],
  ["preferred_diet", "TEXT"],
  ["avoided_allergens_json", "TEXT NOT NULL DEFAULT '[]'"]
].forEach(([name, type]) => {
  if (!userColumns.has(name)) {
    database.exec("ALTER TABLE users ADD COLUMN " + name + " " + type);
  }
});

const recipeColumns = new Set(
  database.prepare("PRAGMA table_info(recipes)").all().map((column) => column.name)
);
if (!recipeColumns.has("image_url")) {
  database.exec("ALTER TABLE recipes ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
}

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

const publicFiles = new Set([
  "css/styles.css",
  "js/auth.js",
  "js/home.js",
  "js/profile.js",
  "js/recipe.js",
  "js/recipes.js"
]);

const attempts = new Map();

function sendJson(response, status, data, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  response.end(JSON.stringify(data));
}

function sendRedirect(response, location) {
  response.writeHead(308, {
    Location: location,
    "Cache-Control": "no-store"
  });
  response.end();
}

function sendFileFrom(response, directory, filename) {
  const filePath = path.join(directory, filename);

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      sendJson(response, 404, { error: "Page not found." });
      return;
    }

    response.writeHead(200, {
      "Content-Type":
        contentTypes[path.extname(filePath)] ||
        "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; img-src 'self' https://img.spoonacular.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    });
    response.end(contents);
  });
}

function sendPublicFile(response, filename) {
  sendFileFrom(response, PUBLIC_DIRECTORY, filename);
}

function sendPage(response, filename) {
  sendFileFrom(response, VIEWS_DIRECTORY, filename);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error("Request is too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });

    request.on("error", reject);
  });
}

function normalizeUsername(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validUsername(username) {
  return /^[A-Za-z0-9_-]{3,30}$/.test(username);
}

function validPassword(password) {
  return typeof password === "string" && password.length >= 8 &&
    password.length <= 128;
}

function passwordHash(password, salt) {
  return scryptSync(password, salt, 64).toString("hex");
}

function passwordsMatch(password, user) {
  const candidate = Buffer.from(
    passwordHash(password, user.password_salt),
    "hex"
  );
  const stored = Buffer.from(user.password_hash, "hex");
  return candidate.length === stored.length &&
    timingSafeEqual(candidate, stored);
}

function parseCookies(request) {
  const cookies = {};
  const header = request.headers.cookie || "";

  header.split(";").forEach((part) => {
    const separator = part.indexOf("=");
    if (separator === -1) return;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    cookies[key] = decodeURIComponent(value);
  });

  return cookies;
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function sessionCookie(token) {
  return [
    "cookwise_session=" + encodeURIComponent(token),
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=" + SESSION_LENGTH_SECONDS
  ].join("; ");
}

function clearSessionCookie() {
  return [
    "cookwise_session=",
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=0"
  ].join("; ");
}

function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt =
    Math.floor(Date.now() / 1000) + SESSION_LENGTH_SECONDS;

  database
    .prepare(
      "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)"
    )
    .run(tokenHash(token), userId, expiresAt);

  return token;
}

function currentUser(request) {
  const token = parseCookies(request).cookwise_session;
  if (!token) return null;

  const now = Math.floor(Date.now() / 1000);
  database.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);

  return (
    database
      .prepare(`
        SELECT
          users.id,
          users.username,
          users.name,
          users.height_cm,
          users.weight_kg,
          users.gender,
          users.preferred_servings,
          users.preferred_cuisine,
          users.preferred_max_cook_time,
          users.preferred_min_protein,
          users.preferred_diet,
          users.avoided_allergens_json
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.token_hash = ? AND sessions.expires_at > ?
      `)
      .get(tokenHash(token), now) || null
  );
}

function publicUser(user) {
  const proteinRange = proteinTargetRange(user.weight_kg);

  const height = centimetersToFeetAndInches(user.height_cm);

  return {
    username: user.username,
    name: user.name,
    heightFeet: height.feet,
    heightInches: height.inches,
    weightPounds: kilogramsToPounds(user.weight_kg),
    gender: user.gender,
    profileComplete: Boolean(
      user.name &&
      user.height_cm &&
      user.weight_kg &&
      user.gender
    ),
    proteinRange,
    preferences: {
      servings: user.preferred_servings,
      cuisine: user.preferred_cuisine || "",
      maxCookTime: user.preferred_max_cook_time,
      minProtein: user.preferred_min_protein
    },
    dietaryPreferences: {
      diet: user.preferred_diet || "",
      avoidedAllergens: parseAvoidedAllergens(user.avoided_allergens_json)
    },
    hasPreferences: hasPreferences(user)
  };
}

function publicRecipe(row, includeDetails = false) {
  const nutrition = JSON.parse(row.nutrition_json);
  const storedIngredients = JSON.parse(row.ingredients_json);
  const allergens = detectAllergens(storedIngredients);
  const dietaryStatus = nutrition.dietary || {};
  const recipe = {
    id: row.id,
    name: cleanPunctuation(row.title),
    description: cleanPunctuation(row.description),
    cuisine: cleanPunctuation(row.cuisine),
    dishType: row.dish_type,
    difficulty: row.difficulty,
    cookTime: row.ready_minutes,
    baseServings: row.servings,
    recommendedServings: row.servings,
    healthScore: Math.round(row.health_score),
    providerScore: Math.round(row.provider_score),
    popularityScore: row.popularity_score,
    smartScore: Math.round(row.smart_score),
    sourceName: cleanPunctuation(row.source_name),
    sourceUrl: row.source_url,
    imageUrl: row.image_url || "",
    allergens,
    allergenLabels: allergens.map((allergen) => allergenLabels[allergen]),
    dietaryStatus,
    dietaryLabels: Object.entries(dietaryStatus)
      .filter(([, matches]) => matches)
      .map(([diet]) => diet.replace("-", " ")),
    macros: {
      calories: nutrition.calories,
      protein: nutrition.protein,
      carbohydrates: nutrition.carbohydrates,
      fat: nutrition.fat,
      fiber: nutrition.fiber,
      sugar: nutrition.sugar,
      sodium: nutrition.sodium
    },
    approvalLevel: nutrition.approvalLevel || "Approved",
    nutritionGuidance: Array.isArray(nutrition.guidance)
      ? nutrition.guidance
      : []
  };

  if (includeDetails) {
    recipe.ingredients = storedIngredients.map((ingredient) =>
      convertIngredientToUs({
        ...ingredient,
        name: cleanIngredientName(ingredient.name),
        original: cleanPunctuation(ingredient.original)
      })
    );
    recipe.steps = JSON.parse(row.steps_json).map((step) => {
      const text = convertTextToUs(
        typeof step === "string" ? step : step.text || step.step
      );
      if (typeof step === "string") {
        return {
          text,
          imageUrl: "",
          ingredientAmounts: ingredientAmountsForStep(text, recipe.ingredients)
        };
      }
      return {
        text,
        imageUrl: step.imageUrl || "",
        ingredientAmounts: ingredientAmountsForStep(text, recipe.ingredients)
      };
    });
  }

  return recipe;
}

function listRecipes(url, user = null) {
  const query = (url.searchParams.get("query") || "").trim();
  const cuisine = (url.searchParams.get("cuisine") || "").trim();
  const difficulty = (url.searchParams.get("difficulty") || "").trim();
  const dishType = (url.searchParams.get("dishType") || "").trim();
  const maxTime = Number(url.searchParams.get("maxTime") || 0);
  const requestedLimit = Number(url.searchParams.get("limit") || 24);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
    : 24;
  const requestedOffset = Number(url.searchParams.get("offset") || 0);
  const offset = Number.isFinite(requestedOffset)
    ? Math.min(Math.max(Math.trunc(requestedOffset), 0), 10000)
    : 0;
  const sort = url.searchParams.get("sort") || "smart";
  const clauses = [];
  const parameters = [];

  if (query) {
    clauses.push(
      "(title LIKE ? OR description LIKE ? OR ingredients_json LIKE ?)"
    );
    const pattern = "%" + query + "%";
    parameters.push(pattern, pattern, pattern);
  }

  if (cuisine) {
    clauses.push("cuisine = ?");
    parameters.push(cuisine);
  }

  if (difficulty) {
    clauses.push("difficulty = ?");
    parameters.push(difficulty);
  }

  if (dishType) {
    clauses.push("dish_type = ?");
    parameters.push(dishType);
  }

  if (maxTime > 0) {
    clauses.push("ready_minutes <= ?");
    parameters.push(maxTime);
  }

  const orderBy = {
    name: "title COLLATE NOCASE ASC",
    time: "ready_minutes ASC, smart_score DESC",
    health: "health_score DESC, smart_score DESC",
    popularity: "provider_score DESC, popularity_score DESC",
    smart: "smart_score DESC, provider_score DESC"
  }[sort] || "smart_score DESC, provider_score DESC";

  const where = clauses.length ? " WHERE " + clauses.join(" AND ") : "";
  let rows = database
    .prepare(
      "SELECT * FROM recipes" +
        where +
        " ORDER BY " +
        orderBy
    )
    .all(...parameters);

  if (sort === "rotate") {
    rows = rotateRecipes(rows);
  }
  let recipes = rows.map((row) => publicRecipe(row));
  if (user) recipes = filterForUser(recipes, user);
  if (sort === "personalized") {
    recipes = personalizeRecipes(recipes, user);
    recipes.forEach((recipe) => {
      recipe.preferenceScore = preferenceScore(recipe, user);
    });
  }

  const total = recipes.length;
  const page = recipes.slice(offset, offset + limit);

  return {
    recipes: page,
    total,
    limit,
    offset,
    hasMore: offset + page.length < total
  };
}

function dailyRecipe(user = null) {
  const rows = database
    .prepare(
      "SELECT * FROM recipes ORDER BY smart_score DESC, provider_score DESC LIMIT 50"
    )
    .all();
  let recipes = rows.map((row) => publicRecipe(row));
  if (user) recipes = filterForUser(recipes, user);
  if (hasPreferences(user)) {
    recipes = personalizeRecipes(recipes, user).slice(0, 10);
  }
  const index = dailyRecipeIndex(recipes.length);
  if (index < 0) return null;

  const recipe = recipes[index];
  return {
    recipe,
    motivation: dailyMotivation(),
    reason:
      (hasPreferences(user) ? "This meal matches your saved preferences. " : "") +
      recommendationReason(recipe),
    personalized: hasPreferences(user),
    date: new Date().toLocaleDateString("en-CA")
  };
}

function cookingStats(userId, recipeId = null) {
  const totals = database
    .prepare(`
      SELECT
        COUNT(*) AS total_meals,
        COUNT(DISTINCT recipe_id) AS unique_recipes
      FROM cooking_history
      WHERE user_id = ?
    `)
    .get(userId);
  const repeatFavorites = database
    .prepare(`
      SELECT COUNT(*) AS count
      FROM (
        SELECT recipe_id
        FROM cooking_history
        WHERE user_id = ?
        GROUP BY recipe_id
        HAVING COUNT(*) >= 4
      )
    `)
    .get(userId).count;
  const recent = database
    .prepare(`
      SELECT
        cooking_history.recipe_id AS recipe_id,
        recipes.title AS title,
        cooking_history.cooked_at AS cooked_at
      FROM cooking_history
      LEFT JOIN recipes ON recipes.id = cooking_history.recipe_id
      WHERE cooking_history.user_id = ?
      ORDER BY cooking_history.cooked_at DESC, cooking_history.id DESC
      LIMIT 5
    `)
    .all(userId)
    .map((row) => ({
      recipeId: row.recipe_id,
      name: row.title || "Previously cooked recipe",
      cookedAt: row.cooked_at
    }));
  const recipeCookCount = recipeId
    ? database
        .prepare(
          "SELECT COUNT(*) AS count FROM cooking_history WHERE user_id = ? AND recipe_id = ?"
        )
        .get(userId, recipeId).count
    : null;

  return {
    totalMeals: totals.total_meals,
    uniqueRecipes: totals.unique_recipes,
    repeatFavorites,
    recipeCookCount,
    achievements: achievementSummary(
      totals.unique_recipes,
      repeatFavorites
    ),
    recent
  };
}

function recordCookedRecipe(response, user, recipeId) {
  const recipe = database
    .prepare("SELECT id FROM recipes WHERE id = ?")
    .get(recipeId);
  if (!recipe) {
    sendJson(response, 404, { error: "Recipe not found." });
    return;
  }

  const previousCount = database
    .prepare(
      "SELECT COUNT(*) AS count FROM cooking_history WHERE user_id = ? AND recipe_id = ?"
    )
    .get(user.id, recipeId).count;
  database
    .prepare(
      "INSERT INTO cooking_history (user_id, recipe_id) VALUES (?, ?)"
    )
    .run(user.id, recipeId);

  const unlocked = [];
  if (previousCount === 0) unlocked.push("Taste Trailblazer");
  if (previousCount === 3) unlocked.push("Encore Expert");
  sendJson(response, 201, {
    ok: true,
    unlocked,
    stats: cookingStats(user.id, recipeId)
  });
}

function recipeFacets() {
  const cuisines = database
    .prepare(
      "SELECT DISTINCT cuisine FROM recipes WHERE cuisine <> '' ORDER BY cuisine"
    )
    .all()
    .map((row) => row.cuisine);
  const count = database.prepare("SELECT COUNT(*) AS count FROM recipes").get()
    .count;

  return { cuisines, count };
}

function isRateLimited(request) {
  const key = request.socket.remoteAddress || "local";
  const now = Date.now();
  const windowStart = now - 15 * 60 * 1000;
  const recent = (attempts.get(key) || []).filter(
    (timestamp) => timestamp > windowStart
  );
  recent.push(now);
  attempts.set(key, recent);
  return recent.length > 20;
}

async function signup(request, response) {
  if (isRateLimited(request)) {
    sendJson(response, 429, {
      error: "Too many attempts. Please wait and try again."
    });
    return;
  }

  const body = await readJson(request);
  const username = normalizeUsername(body.username);
  const password = body.password;
  const confirmPassword = body.confirmPassword;

  if (!validUsername(username)) {
    sendJson(response, 400, {
      error:
        "Username must be 3 to 30 characters using letters, numbers, underscores, or hyphens."
    });
    return;
  }

  if (!validPassword(password)) {
    sendJson(response, 400, {
      error: "Password must be 8 to 128 characters."
    });
    return;
  }

  if (password !== confirmPassword) {
    sendJson(response, 400, { error: "Passwords do not match." });
    return;
  }

  const existing = database
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username);

  if (existing) {
    sendJson(response, 409, { error: "That username is already in use." });
    return;
  }

  const salt = randomBytes(16).toString("hex");
  const result = database
    .prepare(`
      INSERT INTO users (username, password_hash, password_salt)
      VALUES (?, ?, ?)
    `)
    .run(username, passwordHash(password, salt), salt);
  const token = createSession(Number(result.lastInsertRowid));

  sendJson(
    response,
    201,
    { ok: true },
    { "Set-Cookie": sessionCookie(token) }
  );
}

async function signin(request, response) {
  if (isRateLimited(request)) {
    sendJson(response, 429, {
      error: "Too many attempts. Please wait and try again."
    });
    return;
  }

  const body = await readJson(request);
  const username = normalizeUsername(body.username);
  const password = body.password;
  const user = database
    .prepare(
      "SELECT id, password_hash, password_salt FROM users WHERE username = ?"
    )
    .get(username);

  if (!user || !validPassword(password) || !passwordsMatch(password, user)) {
    sendJson(response, 401, { error: "Incorrect username or password." });
    return;
  }

  const token = createSession(user.id);
  sendJson(
    response,
    200,
    { ok: true },
    { "Set-Cookie": sessionCookie(token) }
  );
}

function logout(request, response) {
  const token = parseCookies(request).cookwise_session;
  if (token) {
    database
      .prepare("DELETE FROM sessions WHERE token_hash = ?")
      .run(tokenHash(token));
  }

  sendJson(
    response,
    200,
    { ok: true },
    { "Set-Cookie": clearSessionCookie() }
  );
}

async function deleteAccount(request, response, user) {
  if (isRateLimited(request)) {
    sendJson(response, 429, {
      error: "Too many attempts. Please wait and try again."
    });
    return;
  }

  const body = await readJson(request);
  const account = database
    .prepare(
      "SELECT id, password_hash, password_salt FROM users WHERE id = ?"
    )
    .get(user.id);

  if (
    !account ||
    !validPassword(body.password) ||
    !passwordsMatch(body.password, account)
  ) {
    sendJson(response, 401, { error: "Incorrect password." });
    return;
  }

  database.prepare("DELETE FROM users WHERE id = ?").run(user.id);
  sendJson(
    response,
    200,
    { ok: true },
    { "Set-Cookie": clearSessionCookie() }
  );
}

async function updateProfile(request, response, user) {
  const body = await readJson(request);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const heightFeet = Number(body.heightFeet);
  const heightInches = Number(body.heightInches);
  const weightPounds = Number(body.weightPounds);
  const heightCm = feetAndInchesToCentimeters(heightFeet, heightInches);
  const weightKg = poundsToKilograms(weightPounds);
  const gender = typeof body.gender === "string" ? body.gender : "";
  const allowedGenders = new Set([
    "female",
    "male",
    "nonbinary",
    "prefer-not"
  ]);
  const preferredServings = Number(body.preferences?.servings);
  const preferredCuisine =
    typeof body.preferences?.cuisine === "string"
      ? body.preferences.cuisine.trim()
      : "";
  const preferredMaxCookTime = Number(body.preferences?.maxCookTime);
  const preferredMinProtein = Number(body.preferences?.minProtein);
  const preferredDiet =
    typeof body.dietaryPreferences?.diet === "string"
      ? body.dietaryPreferences.diet
      : "";
  const avoidedAllergens = Array.isArray(body.dietaryPreferences?.avoidedAllergens)
    ? body.dietaryPreferences.avoidedAllergens
    : [];

  if (name.length < 1 || name.length > 100) {
    sendJson(response, 400, { error: "Name is required." });
    return;
  }

  if (
    !Number.isInteger(heightFeet) ||
    heightFeet < 2 ||
    heightFeet > 8 ||
    !Number.isInteger(heightInches) ||
    heightInches < 0 ||
    heightInches > 11 ||
    heightCm < 50 ||
    heightCm > 250
  ) {
    sendJson(response, 400, {
      error: "Enter a valid height in feet and inches."
    });
    return;
  }
  if (!["", "vegetarian", "vegan", "gluten-free", "dairy-free"].includes(preferredDiet)) {
    sendJson(response, 400, { error: "Choose a valid dietary preference." });
    return;
  }
  if (avoidedAllergens.some((allergen) => !ALLERGENS.includes(allergen))) {
    sendJson(response, 400, { error: "Choose valid allergen options." });
    return;
  }

  if (
    !Number.isFinite(weightPounds) ||
    weightPounds < 44 ||
    weightPounds > 882
  ) {
    sendJson(response, 400, {
      error: "Weight must be between 44 and 882 pounds."
    });
    return;
  }

  if (!allowedGenders.has(gender)) {
    sendJson(response, 400, { error: "Choose a valid gender option." });
    return;
  }

  if (
    !Number.isInteger(preferredServings) ||
    preferredServings < 1 ||
    preferredServings > 8
  ) {
    sendJson(response, 400, {
      error: "Preferred servings must be from 1 to 8."
    });
    return;
  }
  const availableCuisines = new Set(recipeFacets().cuisines);
  if (preferredCuisine && !availableCuisines.has(preferredCuisine)) {
    sendJson(response, 400, { error: "Choose a valid cuisine preference." });
    return;
  }
  if (![20, 30, 45, 60, 90].includes(preferredMaxCookTime)) {
    sendJson(response, 400, { error: "Choose a valid cooking time preference." });
    return;
  }
  if (
    !Number.isFinite(preferredMinProtein) ||
    preferredMinProtein < 0 ||
    preferredMinProtein > 60
  ) {
    sendJson(response, 400, {
      error: "Preferred protein must be from 0 to 60 grams."
    });
    return;
  }

  database
    .prepare(`
      UPDATE users
      SET name = ?, height_cm = ?, weight_kg = ?, gender = ?,
          preferred_servings = ?, preferred_cuisine = ?,
          preferred_max_cook_time = ?, preferred_min_protein = ?,
          preferred_diet = ?, avoided_allergens_json = ?
      WHERE id = ?
    `)
    .run(
      name,
      heightCm,
      weightKg,
      gender,
      preferredServings,
      preferredCuisine,
      preferredMaxCookTime,
      preferredMinProtein,
      preferredDiet,
      JSON.stringify([...new Set(avoidedAllergens)]),
      user.id
    );

  const updated = currentUser(request);
  sendJson(response, 200, { user: publicUser(updated) });
}

async function routeApi(request, response, pathname) {
  try {
    if (request.method === "POST" && pathname === "/api/signup") {
      await signup(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/signin") {
      await signin(request, response);
      return;
    }

    if (request.method === "POST" && pathname === "/api/logout") {
      logout(request, response);
      return;
    }

    const user = currentUser(request);

    if (request.method === "DELETE" && pathname === "/api/account") {
      if (!user) {
        sendJson(response, 401, { error: "Sign in required." });
        return;
      }
      await deleteAccount(request, response, user);
      return;
    }

    if (request.method === "GET" && pathname === "/api/recipes") {
      const url = new URL(request.url, "http://" + request.headers.host);
      const result = listRecipes(url, user);
      sendJson(response, 200, {
        ...result,
        facets: recipeFacets(),
        configured: Boolean(process.env.SPOONACULAR_API_KEY)
      });
      return;
    }

    if (request.method === "GET" && pathname === "/api/daily-recipe") {
      const recommendation = dailyRecipe(user);
      if (!recommendation) {
        sendJson(response, 404, { error: "No recipes are available." });
        return;
      }
      sendJson(response, 200, recommendation);
      return;
    }

    if (
      request.method === "GET" &&
      /^\/api\/recipes\/\d+$/.test(pathname)
    ) {
      const id = Number(pathname.split("/").pop());
      const row = database
        .prepare("SELECT * FROM recipes WHERE id = ?")
        .get(id);

      if (!row) {
        sendJson(response, 404, { error: "Recipe not found." });
        return;
      }

      sendJson(response, 200, { recipe: publicRecipe(row, true) });
      return;
    }

    if (request.method === "GET" && pathname === "/api/cooking-stats") {
      if (!user) {
        sendJson(response, 401, { error: "Sign in required." });
        return;
      }
      sendJson(response, 200, { stats: cookingStats(user.id) });
      return;
    }

    if (
      request.method === "GET" &&
      /^\/api\/recipes\/\d+\/cooked$/.test(pathname)
    ) {
      if (!user) {
        sendJson(response, 401, { error: "Sign in required." });
        return;
      }
      const recipeId = Number(pathname.split("/")[3]);
      sendJson(response, 200, {
        stats: cookingStats(user.id, recipeId)
      });
      return;
    }

    if (
      request.method === "POST" &&
      /^\/api\/recipes\/\d+\/cooked$/.test(pathname)
    ) {
      if (!user) {
        sendJson(response, 401, { error: "Sign in required." });
        return;
      }
      recordCookedRecipe(response, user, Number(pathname.split("/")[3]));
      return;
    }

    if (request.method === "GET" && pathname === "/api/me") {
      if (!user) {
        sendJson(response, 401, { error: "Sign in required." });
        return;
      }
      sendJson(response, 200, { user: publicUser(user) });
      return;
    }

    if (request.method === "PUT" && pathname === "/api/profile") {
      if (!user) {
        sendJson(response, 401, { error: "Sign in required." });
        return;
      }
      await updateProfile(request, response, user);
      return;
    }

    sendJson(response, 404, { error: "API route not found." });
  } catch (error) {
    sendJson(response, 400, {
      error: error.message || "The request could not be completed."
    });
  }
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://" + request.headers.host);

  if (url.pathname.startsWith("/api/")) {
    routeApi(request, response, url.pathname);
    return;
  }

  const cleanPageRoutes = new Map([
    ["/", "index.html"],
    ["/about", "about.html"],
    ["/nutrition", "nutrition.html"],
    ["/profile", "profile.html"],
    ["/recipes", "recipes.html"],
    ["/signin", "signin.html"],
    ["/signup", "signup.html"]
  ]);
  const legacyPageRoutes = new Map([
    ["/index.html", "/"],
    ["/about.html", "/about"],
    ["/nutrition.html", "/nutrition"],
    ["/profile.html", "/profile"],
    ["/recipes.html", "/recipes"],
    ["/signin.html", "/signin"],
    ["/signup.html", "/signup"]
  ]);

  if (legacyPageRoutes.has(url.pathname)) {
    sendRedirect(response, legacyPageRoutes.get(url.pathname));
    return;
  }

  if (url.pathname === "/recipe.html") {
    const legacyRecipeId = url.searchParams.get("id");
    sendRedirect(
      response,
      /^\d+$/.test(legacyRecipeId || "")
        ? "/recipes/" + legacyRecipeId
        : "/recipes"
    );
    return;
  }

  if (/^\/recipes\/\d+$/.test(url.pathname)) {
    sendPage(response, "recipe.html");
    return;
  }

  if (cleanPageRoutes.has(url.pathname)) {
    sendPage(response, cleanPageRoutes.get(url.pathname));
    return;
  }

  const filename = decodeURIComponent(url.pathname.slice(1));

  if (!publicFiles.has(filename)) {
    sendJson(response, 404, { error: "Page not found." });
    return;
  }

  sendPublicFile(response, filename);
});

server.listen(PORT, HOST, () => {
  console.log("CookWise is running at http://" + HOST + ":" + PORT);
});

function close() {
  database.close();
}

process.on("SIGINT", () => {
  server.close(close);
});

process.on("SIGTERM", () => {
  server.close(close);
});

module.exports = { server, database };
