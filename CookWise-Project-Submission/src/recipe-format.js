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

function words(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4)
    .map((word) => word.replace(/s$/, ""));
}

function ingredientAmountsForStep(stepText, ingredients) {
  const stepWords = new Set(words(stepText));
  return ingredients
    .filter((ingredient) =>
      words(ingredient.name).some((word) => stepWords.has(word))
    )
    .map(ingredientLabel);
}

module.exports = {
  convertIngredientToUs,
  convertTextToUs,
  ingredientAmountsForStep
};
