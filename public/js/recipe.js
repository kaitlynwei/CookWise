const params = new URLSearchParams(window.location.search);
const recipeId = params.get("id");
let recipe;

function formatQuantity(value) {
  const roundedEighths = Math.round(value * 8);
  const whole = Math.floor(roundedEighths / 8);
  const remainder = roundedEighths % 8;
  const fractions = {
    1: "1/8",
    2: "1/4",
    3: "3/8",
    4: "1/2",
    5: "5/8",
    6: "3/4",
    7: "7/8"
  };

  if (remainder === 0) return String(whole);
  return whole > 0
    ? whole + " " + fractions[remainder]
    : fractions[remainder];
}

function displayUnit(unit, amount) {
  if (Math.abs(amount - 1) >= 0.001) return unit;

  const singularUnits = {
    cups: "cup",
    tablespoons: "tablespoon",
    teaspoons: "teaspoon",
    cloves: "clove",
    cans: "can",
    ounces: "ounce",
    pounds: "pound"
  };

  return singularUnits[unit.toLowerCase()] || unit;
}

function renderIngredients(servings) {
  const multiplier = servings / recipe.baseServings;
  const ingredientList = document.querySelector("#ingredient-list");
  ingredientList.replaceChildren();

  recipe.ingredients.forEach((ingredient) => {
    const row = document.createElement("tr");
    const amount = document.createElement("td");
    const name = document.createElement("td");
    const scaledAmount = ingredient.amount * multiplier;

    amount.textContent =
      formatQuantity(scaledAmount) +
      (ingredient.unit
        ? " " + displayUnit(ingredient.unit, scaledAmount)
        : "");
    name.textContent = ingredient.name;
    row.append(amount, name);
    ingredientList.append(row);
  });
}

function addMacro(list, name, value, unit, servings) {
  const item = document.createElement("li");
  const unitText = unit ? " " + unit : "";
  item.textContent =
    name +
    ": " +
    value.toLocaleString() +
    unitText +
    " per serving; " +
    (value * servings).toLocaleString() +
    unitText +
    " recipe total";
  list.append(item);
}

function renderMacros(servings) {
  const list = document.querySelector("#macro-list");
  list.replaceChildren();

  addMacro(list, "Calories", recipe.macros.calories, "", servings);
  addMacro(list, "Protein", recipe.macros.protein, "grams", servings);
  addMacro(
    list,
    "Carbohydrates",
    recipe.macros.carbohydrates,
    "grams",
    servings
  );
  addMacro(list, "Fat", recipe.macros.fat, "grams", servings);
  addMacro(list, "Fiber", recipe.macros.fiber, "grams", servings);
  addMacro(list, "Sugar", recipe.macros.sugar, "grams", servings);
  addMacro(list, "Sodium", recipe.macros.sodium, "milligrams", servings);
}

function updateServings() {
  const select = document.querySelector("#serving-select");
  const servings = Number(select.value);
  const people = servings === 1 ? "person" : "people";

  renderIngredients(servings);
  renderMacros(servings);
  document.querySelector("#serving-status").textContent =
    "Ingredient amounts and recipe totals are shown for " +
    servings +
    " " +
    people +
    ".";
}

function smartEatingText() {
  const parts = [
    (recipe.approvalLevel || "Approved") + ".",
    "This recipe was selected with a " +
      recipe.healthScore +
      "/100 provider health score and a " +
      recipe.providerScore +
      "/100 provider recipe score."
  ];

  if (recipe.macros.protein >= 20) {
    parts.push("It supplies at least 20 grams of protein per serving.");
  }
  if (recipe.macros.fiber >= 5) {
    parts.push("It supplies at least 5 grams of fiber per serving.");
  }
  if (recipe.dishType === "Sweet") {
    parts.push(
      "For a sweet recipe, consider the serving size and the day's total added sugar."
    );
  }
  if (recipe.macros.sodium >= 700) {
    parts.push(
      "Its estimated sodium is relatively high, so lower-sodium ingredient choices may be useful."
    );
  }

  if ((recipe.nutritionGuidance || []).length) {
    parts.push(...recipe.nutritionGuidance);
  }

  return parts.join(" ");
}

async function loadPersonalComparison() {
  const response = await fetch("/api/me");
  if (!response.ok) return;

  const result = await response.json();
  const user = result.user;
  const context = document.querySelector("#personal-recipe-context");

  if (!user.profileComplete || !user.proteinReference) {
    context.replaceChildren();
    const text = document.createTextNode(
      "Complete your profile to compare this recipe with your personal protein reference. "
    );
    const link = document.createElement("a");
    link.href = "profile.html";
    link.textContent = "Complete profile";
    context.append(text, link);
    return;
  }

  const percentage = Math.round(
    (recipe.macros.protein / user.proteinReference) * 100
  );
  context.textContent =
    "One serving provides " +
    recipe.macros.protein +
    " grams of protein, about " +
    percentage +
    "% of your illustrative " +
    user.proteinReference +
    "-gram adult daily protein baseline. This is a general comparison, not a personal medical target.";
}

function renderRecipe() {
  document.title = recipe.name + " | CookWise";
  document.querySelector("#recipe-name").textContent = recipe.name;
  document.querySelector("#recipe-description").textContent =
    recipe.description;
  document.querySelector("#recipe-cuisine").textContent = recipe.cuisine;
  document.querySelector("#recipe-dish-type").textContent = recipe.dishType;
  document.querySelector("#recipe-difficulty").textContent =
    recipe.difficulty;
  document.querySelector("#recipe-time").textContent = recipe.cookTime;
  document.querySelector("#recommended-servings").textContent =
    recipe.recommendedServings;
  document.querySelector("#convenience-note").textContent =
    "The source recipe is written for " +
    recipe.baseServings +
    " servings, which avoids awkward partial package measurements.";
  document.querySelector("#provider-score").textContent =
    recipe.providerScore;
  document.querySelector("#health-score").textContent = recipe.healthScore;
  const sourceLink = document.querySelector("#source-link");
  sourceLink.href = recipe.sourceUrl;
  sourceLink.textContent = recipe.sourceName;
  document.querySelector("#smart-context").textContent = smartEatingText();

  const select = document.querySelector("#serving-select");
  const recommended = Math.min(
    Math.max(recipe.recommendedServings, 1),
    8
  );
  select.value = String(recommended);
  const recommendedOption = select.querySelector(
    'option[value="' + recommended + '"]'
  );
  if (recommendedOption) recommendedOption.textContent += " (recommended)";

  const instructionList = document.querySelector("#instruction-list");
  recipe.steps.forEach((step) => {
    const item = document.createElement("li");
    item.textContent = step;
    instructionList.append(item);
  });

  select.addEventListener("change", updateServings);
  updateServings();
  loadPersonalComparison();
}

async function loadRecipe() {
  if (!recipeId || !/^\d+$/.test(recipeId)) {
    document.querySelector("#recipe").hidden = true;
    document.querySelector("#missing-recipe").hidden = false;
    return;
  }

  const response = await fetch("/api/recipes/" + recipeId);
  if (!response.ok) {
    document.querySelector("#recipe").hidden = true;
    document.querySelector("#missing-recipe").hidden = false;
    return;
  }

  const result = await response.json();
  recipe = result.recipe;
  renderRecipe();
}

loadRecipe().catch(() => {
  document.querySelector("#recipe").hidden = true;
  document.querySelector("#missing-recipe").hidden = false;
});
