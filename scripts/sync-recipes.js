const {
  candidateCountFromArguments,
  openCatalogDatabase,
  runCatalogRefresh
} = require("../src/recipe-catalog");

async function syncRecipes(options = {}) {
  const apiKey = options.apiKey || process.env.SPOONACULAR_API_KEY;
  if (!apiKey) {
    throw new Error(
      "SPOONACULAR_API_KEY is missing. Copy .env.example to .env and add your Spoonacular API key."
    );
  }
  const database = options.database || openCatalogDatabase();
  const closeDatabase = !options.database;
  try {
    const result = await runCatalogRefresh({
      database,
      apiKey,
      candidateTarget: options.candidateTarget || candidateCountFromArguments(),
      fetchImpl: options.fetchImpl,
      force: true,
      now: options.now || Date.now()
    });
    if (result.status !== "refreshed") {
      console.log("Recipe sync skipped: " + result.reason + ".");
      return result;
    }
    console.log(
      "Recipe sync complete: " + result.reviewed +
      " candidates reviewed across " + result.topics +
      " rotating topics, " + result.added + " added, " +
      result.updated + " updated, " + result.total + " total."
    );
    return result;
  } finally {
    if (closeDatabase) database.close();
  }
}

if (require.main === module) {
  syncRecipes().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { syncRecipes };
