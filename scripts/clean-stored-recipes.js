const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { cleanIngredientName, cleanPunctuation } = require("../src/text");

const databasePath = path.join(__dirname, "..", "data", "cookwise.db");
const database = new DatabaseSync(databasePath);
const rows = database.prepare("SELECT * FROM recipes ORDER BY id").all();
const update = database.prepare(`
  UPDATE recipes
  SET title = ?, description = ?, cuisine = ?, source_name = ?,
      ingredients_json = ?, steps_json = ?
  WHERE id = ?
`);

let changedRecipes = 0;
let changedFields = 0;

database.exec("BEGIN");
try {
  rows.forEach((row) => {
    const ingredients = JSON.parse(row.ingredients_json).map((ingredient) => ({
      ...ingredient,
      name: cleanIngredientName(ingredient.name),
      original: cleanPunctuation(ingredient.original)
    }));
    const steps = JSON.parse(row.steps_json).map((step) => {
      if (typeof step === "string") return cleanPunctuation(step);
      if (Object.hasOwn(step, "text")) {
        return { ...step, text: cleanPunctuation(step.text) };
      }
      return { ...step, step: cleanPunctuation(step.step) };
    });
    const values = {
      title: cleanPunctuation(row.title),
      description: cleanPunctuation(row.description),
      cuisine: cleanPunctuation(row.cuisine),
      sourceName: cleanPunctuation(row.source_name),
      ingredientsJson: JSON.stringify(ingredients),
      stepsJson: JSON.stringify(steps)
    };
    const originals = [
      row.title,
      row.description,
      row.cuisine,
      row.source_name,
      row.ingredients_json,
      row.steps_json
    ];
    const cleaned = [
      values.title,
      values.description,
      values.cuisine,
      values.sourceName,
      values.ingredientsJson,
      values.stepsJson
    ];
    const changes = cleaned.filter((value, index) => value !== originals[index])
      .length;

    if (!changes) return;
    update.run(
      values.title,
      values.description,
      values.cuisine,
      values.sourceName,
      values.ingredientsJson,
      values.stepsJson,
      row.id
    );
    changedRecipes += 1;
    changedFields += changes;
  });
  database.exec("COMMIT");
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
} finally {
  database.close();
}

console.log(
  `Recipe text cleanup complete: ${changedRecipes} recipes and ${changedFields} stored fields updated.`
);
