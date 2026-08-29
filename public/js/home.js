let recipes = [];

function compactRecipeFacts() {
  return ["Ingredients, instructions, nutrition, and source available when opened"];
}

function shortDescription() {
  return "Open this recipe for its current ingredients, instructions, nutrition details, and credited source.";
}

function renderDescription(list, facts) {
  list.replaceChildren();
  facts.forEach((fact) => {
    const item = document.createElement("li");
    item.textContent = fact.replace(/[.!?]+$/, "");
    if (fact.startsWith("About ")) {
      item.classList.add("recipe-time");
    }
    list.append(item);
  });
}

function renderRecommendation(recipe) {
  if (!recipe) return;

  const container = document.querySelector("#daily-recommendation");
  document.querySelector("#recommended-name").textContent = recipe.name;
  document.querySelector("#recommended-description").textContent =
    shortDescription(recipe);
  renderDescription(
    document.querySelector("#recommended-summary"),
    compactRecipeFacts(recipe)
  );
  document.querySelector("#recommended-link").href =
    "/recipes/" + recipe.id;
  const imageWrap = document.querySelector("#recommended-image-wrap");
  imageWrap.replaceChildren();
  if (recipe.imageUrl) {
    imageWrap.hidden = false;
    const image = document.createElement("img");
    image.src = recipe.imageUrl;
    image.alt = "Completed " + recipe.name;
    image.referrerPolicy = "no-referrer";
    imageWrap.append(image);
  } else {
    imageWrap.hidden = true;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => container.classList.remove("is-loading"));
  });
}

function renderPopularRecipes(dailyRecipeId) {
  const container = document.querySelector("#popular-recipes");
  container.replaceChildren();

  recipes
    .filter((recipe) => recipe.id !== dailyRecipeId)
    .slice(0, 3)
    .forEach((recipe, index) => {
    const article = document.createElement("article");
    const heading = document.createElement("h3");
    const link = document.createElement("a");
    const description = document.createElement("p");
    const summary = document.createElement("ul");

    article.className = "recipe-card recipe-card-enter";
    article.style.setProperty("--card-index", index);

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
    description.className = "recipe-card-description";
    description.textContent = shortDescription(recipe);
    summary.className = "recipe-meta";
    summary.setAttribute("aria-label", "Recipe details");
    renderDescription(summary, compactRecipeFacts(recipe));
    article.append(heading, description, summary);
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
    document.querySelector("#daily-recommendation").classList.remove("is-loading");
    document.querySelector("#popular-recipes").textContent =
      "Popular recipes will appear after the recipe database is synced.";
    return;
  }

  recipes = result.recipes;
  document.querySelector("#hero-recipe-count").textContent =
    result.facets.count + " recipes";
  document.querySelector("#daily-motivation").textContent = daily.motivation;
  renderRecommendation(daily.recipe);
  renderPopularRecipes(daily.recipe.id);
}

loadHomeRecipes().catch(() => {
  document.querySelector("#recommended-name").textContent =
    "Recipe database unavailable";
  renderDescription(
    document.querySelector("#recommended-summary"),
    ["CookWise could not load recipes", "Confirm the server is running and try again"]
  );
  document.querySelector("#daily-recommendation").classList.remove("is-loading");
});
