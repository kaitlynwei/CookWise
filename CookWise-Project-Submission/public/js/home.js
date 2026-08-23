let recipes = [];

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
  list.replaceChildren();
  facts.forEach((fact) => {
      const item = document.createElement("li");
      item.textContent = fact.replace(/[.!?]+$/, "");
      list.append(item);
  });
}

function renderRecommendation(recipe) {
  if (!recipe) return;

  document.querySelector("#recommended-name").textContent = recipe.name;
  renderDescription(
    document.querySelector("#recommended-summary"),
    recipeFacts(recipe)
  );
  document.querySelector("#recommended-link").href =
    "recipe.html?id=" + recipe.id;
  const container = document.querySelector("#daily-recommendation");
  const oldImage = container.querySelector("img");
  if (oldImage) oldImage.remove();
  if (recipe.imageUrl) {
    const image = document.createElement("img");
    image.src = recipe.imageUrl;
    image.alt = "Completed " + recipe.name;
    image.referrerPolicy = "no-referrer";
    container.prepend(image);
  }
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
    container.append(article);
  });
}

async function loadHomeRecipes() {
  const [recipeResponse, dailyResponse] = await Promise.all([
    fetch("/api/recipes?limit=30&sort=rotate"),
    fetch("/api/daily-recipe")
  ]);
  const result = await recipeResponse.json();
  const daily = await dailyResponse.json();

  if (!recipeResponse.ok || !dailyResponse.ok || result.recipes.length === 0) {
    document.querySelector("#recommended-name").textContent =
      "Recipe database setup needed";
    renderDescription(
      document.querySelector("#recommended-summary"),
      ["No internet recipes have been imported yet", "Add a Spoonacular API key and run npm run recipes:sync"]
    );
    document.querySelector("#recommended-link").hidden = true;
    document.querySelector("#popular-recipes").textContent =
      "Popular recipes will appear after the recipe database is synced.";
    return;
  }

  recipes = result.recipes;
  document.querySelector("#hero-recipe-count").textContent =
    result.facets.count + " recipes";
  renderRecommendation(daily.recipe);
  renderPopularRecipes();
}

loadHomeRecipes().catch(() => {
  document.querySelector("#recommended-name").textContent =
    "Recipe database unavailable";
  renderDescription(
    document.querySelector("#recommended-summary"),
    ["CookWise could not load recipes", "Confirm the server is running and try again"]
  );
});
