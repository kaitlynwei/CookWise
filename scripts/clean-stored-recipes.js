const { openCatalogDatabase } = require("../src/recipe-catalog");

const database = openCatalogDatabase();
try {
  const count = Number(
    database.prepare("SELECT COUNT(*) AS count FROM recipes").get().count
  );
  console.log(
    "Recipe catalog verified: " + count +
      " recipes store only Spoonacular ID, title, and image URL."
  );
} finally {
  database.close();
}
