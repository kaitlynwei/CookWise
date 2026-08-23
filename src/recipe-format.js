const { cleanPunctuation } = require("./text");

function rounded(value) {
  return Math.round(value * 100) / 100;
}

function convertIngredientToUs(ingredient) {
  const amount = Number(ingredient.amount);
  const unit = String(ingredient.unit || "").toLowerCase().trim();
  if (!Number.isFinite(amount)) return ingredient;

  const conversions = {
    g: [amount / 28.3495, "ounces"],
    gram: [amount / 28.3495, "ounces"],
    grams: [amount / 28.3495, "ounces"],
    kg: [amount * 2.20462, "pounds"],
    kilogram: [amount * 2.20462, "pounds"],
    kilograms: [amount * 2.20462, "pounds"],
    ml: [amount / 236.588, "cups"],
    milliliter: [amount / 236.588, "cups"],
    milliliters: [amount / 236.588, "cups"],
    l: [amount * 4.22675, "cups"],
    liter: [amount * 4.22675, "cups"],
    liters: [amount * 4.22675, "cups"]
  };
  if (!conversions[unit]) return ingredient;
  return { ...ingredient, amount: rounded(conversions[unit][0]), unit: conversions[unit][1] };
}

function convertTextToUs(value) {
  return cleanPunctuation(value)
    .replace(/(\d+(?:\.\d+)?)\s*°?C\b/gi, (_, number) =>
      Math.round((Number(number) * 9) / 5 + 32) + "°F"
    )
    .replace(/(\d+(?:\.\d+)?)\s*cm\b/gi, (_, number) =>
      rounded(Number(number) / 2.54) + " inches"
    );
}

function ingredientLabel(ingredient) {
  const amount = rounded(Number(ingredient.amount));
  return [amount, ingredient.unit, ingredient.name].filter(Boolean).join(" ");
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ingredientNamePattern(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9'-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const escaped = escapeRegularExpression(word);
      return "(?:" + escaped + "|" + escaped + "s|" + escaped + "es)";
    })
    .join("\\s+");
}

function numericAmount(value) {
  const normalized = String(value).trim();
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  const fraction = normalized.match(/^(\d+)?\s*(\d+)\s*\/\s*(\d+)$/);
  if (!fraction) return null;
  return Number(fraction[1] || 0) + Number(fraction[2]) / Number(fraction[3]);
}

function explicitIngredientLabel(stepText, ingredient) {
  const namePattern = ingredientNamePattern(ingredient.name);
  if (!namePattern) return null;

  const quantity = "(\\d+(?:\\.\\d+)?(?:\\s+\\d+\\s*\\/\\s*\\d+)?|\\d+\\s*\\/\\s*\\d+)";
  const unit = "(tablespoons?|tbsp|teaspoons?|tsp|cups?|ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kg|milliliters?|ml|liters?|l|cloves?|cans?|packages?|pieces?|slices?|stalks?|sprigs?|pinches?)?";
  const pattern = new RegExp(
    quantity +
      "\\s*" +
      unit +
      "(?:\\s+of)?\\s+(?:the\\s+)?(?:[a-z'-]+\\s+){0,3}" +
      namePattern +
      "\\b",
    "i"
  );
  const match = String(stepText || "").match(pattern);
  if (!match) return null;

  const amountText = match[1].replace(/\s+/g, " ");
  const unitText = String(match[2] || "").replace(/\.$/, "");
  const amount = numericAmount(amountText);
  if (amount !== null && unitText) {
    const converted = convertIngredientToUs({
      amount,
      unit: unitText,
      name: ingredient.name
    });
    return ingredientLabel(converted);
  }
  return [amountText, unitText, ingredient.name].filter(Boolean).join(" ");
}

function ingredientAmountsForStep(stepText, ingredients) {
  return ingredients
    .map((ingredient) => explicitIngredientLabel(stepText, ingredient))
    .filter(Boolean);
}

module.exports = {
  convertIngredientToUs,
  convertTextToUs,
  ingredientAmountsForStep
};
