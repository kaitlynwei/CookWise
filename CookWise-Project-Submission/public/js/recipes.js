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

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function sourceLabel(value) {
  return titleCase(value.replace(/^www\./i, "").replace(/\.(com|org|net)$/i, ""));
}

function recipeFacts(recipe) {
  const category = [
    recipe.cuisine === "International" ? "" : recipe.cuisine,
    recipe.dishType
  ].filter(Boolean).join(" · ");
  const dietary = (recipe.dietaryLabels || []).map(titleCase).join(" · ");
  const nutrition =
    Math.round(recipe.macros.calories) +
    " calories · " +
    Math.round(recipe.macros.protein) +
    "g protein · " +
    Math.round(recipe.macros.fat) +
    "g fat per serving";

  return [category, dietary, nutrition, "From " + sourceLabel(recipe.sourceName)]
    .filter(Boolean);
}

function renderDescription(list, facts) {
  facts.forEach((fact) => {
      const item = document.createElement("li");
      item.textContent = fact.replace(/[.!?]+$/, "");
      list.append(item);
  });
}

function renderRecipe(recipe) {
  const article = document.createElement("article");
  const heading = document.createElement("h3");
  const link = document.createElement("a");
  const summary = document.createElement("ul");

  if (recipe.imageUrl) {
    const image = document.createElement("img");
    image.src = recipe.imageUrl;
    image.alt = "Completed " + recipe.name;
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    article.append(image);
  }

  link.href = "recipe.html?id=" + recipe.id;
  link.textContent = recipe.name;
  heading.append(link);
  summary.className = "recipe-preview-summary";
  renderDescription(summary, recipeFacts(recipe));
  article.append(heading, summary);
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
  parameters.set("limit", "100");
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
