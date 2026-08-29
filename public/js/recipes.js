const filters = document.querySelector("#recipe-filters");
const searchInput = document.querySelector("#recipe-search");
const sortRecipes = document.querySelector("#sort-recipes");
const results = document.querySelector("#recipe-results");
const resultCount = document.querySelector("#result-count");
const loadMoreButton = document.querySelector("#load-more-recipes");
const pageSize = 50;
let searchTimer;
let displayedCount = 0;
let requestVersion = 0;

function recipeFacts() {
  return ["Open for ingredients, instructions, nutrition, and original source"];
}

function renderDescription(list, facts) {
  facts.forEach((fact) => {
    const item = document.createElement("li");
    item.textContent = fact.replace(/[.!?]+$/, "");
    list.append(item);
  });
}

function renderRecipe(recipe, index) {
  const article = document.createElement("article");
  const heading = document.createElement("h3");
  const link = document.createElement("a");
  const summary = document.createElement("ul");

  article.className = "recipe-card recipe-card-enter";
  article.style.setProperty("--card-index", Math.min(index, 8));

  if (recipe.imageUrl) {
    const image = document.createElement("img");
    image.src = recipe.imageUrl;
    image.alt = "Completed " + recipe.name;
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    article.append(image);
  }

  link.href = "/recipes/" + recipe.id;
  link.textContent = recipe.name;
  heading.append(link);
  summary.className = "recipe-preview-summary";
  renderDescription(summary, recipeFacts(recipe));
  article.append(heading, summary);
  results.append(article);
}

function queryString(offset = 0) {
  const parameters = new URLSearchParams();
  if (searchInput.value.trim()) {
    parameters.set("query", searchInput.value.trim());
  }
  parameters.set("sort", sortRecipes.value);
  parameters.set("limit", String(pageSize));
  parameters.set("offset", String(offset));
  return parameters.toString();
}

async function renderResults({ append = false } = {}) {
  const requestId = ++requestVersion;
  const offset = append ? displayedCount : 0;

  if (append) {
    resultCount.textContent = "Loading more recipes.";
    loadMoreButton.disabled = true;
    loadMoreButton.textContent = "Loading more recipes";
  } else {
    displayedCount = 0;
    resultCount.textContent = "Loading recipes.";
    results.replaceChildren();
    loadMoreButton.hidden = true;
  }

  try {
    const response = await fetch("/api/recipes?" + queryString(offset));
    const result = await response.json();
    if (requestId !== requestVersion) return;
    if (!response.ok) throw new Error("Recipe request failed");

    const recipes = result.recipes || [];

    if (!append && recipes.length === 0) {
      const message = document.createElement("p");
      message.textContent =
        result.facets.count === 0
          ? "No internet recipes have been imported yet. Add a Spoonacular API key and run npm run recipes:sync."
          : "No recipes match those filters. Try removing one or clearing all filters.";
      results.append(message);
      loadMoreButton.hidden = true;
      return;
    }

    recipes.forEach((recipe, index) => {
      renderRecipe(recipe, displayedCount + index);
    });
    displayedCount += recipes.length;

    const total = Number(result.total ?? displayedCount);
    const label = total === 1 ? "recipe" : "recipes";
    resultCount.textContent =
      "Showing " + displayedCount + " of " + total + " " + label + ".";
    loadMoreButton.hidden = !result.hasMore;
    loadMoreButton.disabled = false;
    loadMoreButton.textContent = "Load more recipes";
  } catch {
    if (requestId !== requestVersion) return;

    if (append) {
      resultCount.textContent =
        "CookWise could not load more recipes. Your current results are still available.";
      loadMoreButton.hidden = false;
      loadMoreButton.disabled = false;
      loadMoreButton.textContent = "Try loading more recipes";
      return;
    }

    resultCount.textContent = "Recipe search is unavailable.";
    const message = document.createElement("p");
    message.textContent =
      "Confirm the CookWise server is running, then try again.";
    results.append(message);
    loadMoreButton.hidden = true;
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
loadMoreButton.addEventListener("click", () => {
  renderResults({ append: true });
});

renderResults();
