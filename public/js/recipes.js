const filters = document.querySelector("#recipe-filters");
const searchInput = document.querySelector("#recipe-search");
const cuisineFilter = document.querySelector("#cuisine-filter");
const difficultyFilter = document.querySelector("#difficulty-filter");
const dishFilter = document.querySelector("#dish-filter");
const timeFilter = document.querySelector("#time-filter");
const sortRecipes = document.querySelector("#sort-recipes");
const results = document.querySelector("#recipe-results");
const resultCount = document.querySelector("#result-count");
let searchTimer;

function renderRecipe(recipe) {
  const article = document.createElement("article");
  const heading = document.createElement("h3");
  const link = document.createElement("a");
  const description = document.createElement("p");
  const details = document.createElement("p");
  const scores = document.createElement("p");
  const source = document.createElement("p");

  link.href = "recipe.html?id=" + recipe.id;
  link.textContent = recipe.name;
  heading.append(link);
  description.textContent = recipe.description;
  details.textContent =
    recipe.cuisine +
    " | " +
    recipe.dishType +
    " | " +
    recipe.difficulty +
    " | Approximately " +
    recipe.cookTime +
    " minutes";
  scores.textContent =
    "Provider score: " +
    recipe.providerScore +
    "/100 | Health score: " +
    recipe.healthScore +
    "/100";
  source.textContent = "Source: " + recipe.sourceName;
  article.append(heading, description, details, scores, source);
  results.append(article);
}

function queryString() {
  const parameters = new URLSearchParams();
  if (searchInput.value.trim()) {
    parameters.set("query", searchInput.value.trim());
  }
  if (cuisineFilter.value) {
    parameters.set("cuisine", cuisineFilter.value);
  }
  if (difficultyFilter.value) {
    parameters.set("difficulty", difficultyFilter.value);
  }
  if (dishFilter.value) {
    parameters.set("dishType", dishFilter.value);
  }
  if (timeFilter.value) {
    parameters.set("maxTime", timeFilter.value);
  }
  parameters.set("sort", sortRecipes.value);
  parameters.set("limit", "50");
  return parameters.toString();
}

async function renderResults() {
  resultCount.textContent = "Loading recipes.";
  results.replaceChildren();

  try {
    const response = await fetch("/api/recipes?" + queryString());
    const result = await response.json();
    const recipes = result.recipes || [];

    if (cuisineFilter.options.length === 1) {
      result.facets.cuisines.forEach((cuisine) => {
        const option = document.createElement("option");
        option.value = cuisine;
        option.textContent = cuisine;
        cuisineFilter.append(option);
      });
    }

    const label = recipes.length === 1 ? "recipe" : "recipes";
    resultCount.textContent = recipes.length + " " + label + " found.";

    if (recipes.length === 0) {
      const message = document.createElement("p");
      message.textContent =
        result.facets.count === 0
          ? "No internet recipes have been imported yet. Add a Spoonacular API key and run npm run recipes:sync."
          : "No recipes match those filters. Try removing one or clearing all filters.";
      results.append(message);
      return;
    }

    recipes.forEach(renderRecipe);
  } catch {
    resultCount.textContent = "Recipe search is unavailable.";
    const message = document.createElement("p");
    message.textContent =
      "Confirm the CookWise server is running, then try again.";
    results.append(message);
  }
}

filters.addEventListener("change", renderResults);
searchInput.addEventListener("input", () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(renderResults, 250);
});
filters.addEventListener("reset", () => {
  window.setTimeout(renderResults, 0);
});

renderResults();
