let recipes = [];
let recommendationIndex = 0;

function recipeDetails(recipe) {
  return (
    recipe.cuisine +
    " | " +
    recipe.dishType +
    " | " +
    recipe.difficulty +
    " | Approximately " +
    recipe.cookTime +
    " minutes"
  );
}

function renderRecommendation() {
  const recipe = recipes[recommendationIndex];
  if (!recipe) return;

  document.querySelector("#recommended-name").textContent = recipe.name;
  document.querySelector("#recommended-description").textContent =
    recipe.description;
  document.querySelector("#recommended-details").textContent =
    recipeDetails(recipe);
  document.querySelector("#recommended-reason").textContent =
    "Why this meal: Provider score " +
    recipe.providerScore +
    "/100, health score " +
    recipe.healthScore +
    "/100, and a practical ingredient list.";
  document.querySelector("#recommended-link").href =
    "recipe.html?id=" + recipe.id;
}

function renderPopularRecipes() {
  const container = document.querySelector("#popular-recipes");
  container.replaceChildren();

  const savory = recipes
    .filter((recipe) => recipe.dishType !== "Sweet")
    .slice(0, 4);
  const sweet = recipes
    .filter((recipe) => recipe.dishType === "Sweet")
    .slice(0, 2);

  [...savory, ...sweet].forEach((recipe) => {
    const article = document.createElement("article");
    const heading = document.createElement("h3");
    const link = document.createElement("a");
    const description = document.createElement("p");
    const details = document.createElement("p");
    const scores = document.createElement("p");

    link.href = "recipe.html?id=" + recipe.id;
    link.textContent = recipe.name;
    heading.append(link);
    description.textContent = recipe.description;
    details.textContent = recipeDetails(recipe);
    scores.textContent =
      "Provider score: " +
      recipe.providerScore +
      "/100 | Health score: " +
      recipe.healthScore +
      "/100";
    article.append(heading, description, details, scores);
    container.append(article);
  });
}

async function loadHomeRecipes() {
  const response = await fetch("/api/recipes?limit=30&sort=smart");
  const result = await response.json();

  if (!response.ok || result.recipes.length === 0) {
    document.querySelector("#recommended-name").textContent =
      "Recipe database setup needed";
    document.querySelector("#recommended-description").textContent =
      "No internet recipes have been imported yet. Add a Spoonacular API key and run npm run recipes:sync.";
    document.querySelector("#recommended-details").textContent = "";
    document.querySelector("#recommended-reason").textContent = "";
    document.querySelector("#recommended-link").hidden = true;
    document.querySelector("#another-recommendation").hidden = true;
    document.querySelector("#popular-recipes").textContent =
      "Popular recipes will appear after the recipe database is synced.";
    return;
  }

  recipes = result.recipes;
  recommendationIndex = new Date().getDate() % recipes.length;
  renderRecommendation();
  renderPopularRecipes();
}

document
  .querySelector("#another-recommendation")
  .addEventListener("click", () => {
    if (!recipes.length) return;
    recommendationIndex = (recommendationIndex + 1) % recipes.length;
    renderRecommendation();
  });

loadHomeRecipes().catch(() => {
  document.querySelector("#recommended-name").textContent =
    "Recipe database unavailable";
  document.querySelector("#recommended-description").textContent =
    "CookWise could not load recipes. Confirm the server is running and try again.";
});
