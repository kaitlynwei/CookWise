const form = document.querySelector("#profile-form");
const message = document.querySelector("#profile-message");
const personalContext = document.querySelector("#personal-context");
const cuisineOptions = [
  "African", "American", "Asian", "Caribbean", "French", "Greek",
  "Indian", "Italian", "Japanese", "Korean", "Latin American",
  "Mediterranean", "Mexican", "Middle Eastern", "Thai", "Vietnamese"
];

function renderContext(user) {
  personalContext.replaceChildren();

  if (!user.profileComplete) {
    const prompt = document.createElement("p");
    prompt.textContent =
      "Save all four profile fields to see personal macro context.";
    personalContext.append(prompt);
    return;
  }

  const heading = document.createElement("h3");
  heading.textContent = "General Protein Range Based on Body Weight";
  const protein = document.createElement("p");
  const mealMinimum = Math.round(user.proteinRange.min / 3);
  const mealMaximum = Math.round(user.proteinRange.max / 3);
  protein.textContent =
    "The 2025 to 2030 Dietary Guidelines for Americans gives a general protein target of 1.2 to 1.6 grams per kilogram of body weight per day. Based on your saved weight, that is approximately " +
    user.proteinRange.min +
    " to " +
    user.proteinRange.max +
    " grams per day. Divided evenly across three meals, that would be about " +
    mealMinimum +
    " to " +
    mealMaximum +
    " grams per meal.";

  const limitation = document.createElement("p");
  limitation.textContent = "These numbers are approximations.";

  personalContext.append(heading, protein, limitation);
}

function fillProfile(user) {
  document.querySelector("#profile-username").textContent = user.username;
  document.querySelector("#name").value = user.name || "";
  document.querySelector("#height-feet").value = user.heightFeet || "";
  document.querySelector("#height-inches").value =
    user.heightInches === null ? "" : user.heightInches;
  document.querySelector("#weight-pounds").value =
    user.weightPounds || "";
  document.querySelector("#gender").value = user.gender || "";
  document.querySelector("#preferred-servings").value =
    String(user.preferences.servings || 2);
  document.querySelector("#preferred-cuisine").value =
    user.preferences.cuisine || "";
  document.querySelector("#preferred-cook-time").value =
    String(user.preferences.maxCookTime || 45);
  document.querySelector("#preferred-protein").value =
    String(user.preferences.minProtein || 0);
  document.querySelector("#preferred-diet").value =
    user.dietaryPreferences.diet || "";
  const avoided = new Set(user.dietaryPreferences.avoidedAllergens || []);
  document.querySelectorAll('input[name="avoidedAllergens"]').forEach((input) => {
    input.checked = avoided.has(input.value);
  });
  renderContext(user);
}

function loadCuisineOptions() {
  const select = document.querySelector("#preferred-cuisine");
  cuisineOptions.forEach((cuisine) => {
    const option = document.createElement("option");
    option.value = cuisine;
    option.textContent = cuisine;
    select.append(option);
  });
}

async function loadCookingStats() {
  const response = await fetch("/api/cooking-stats");
  if (!response.ok) return;
  const { stats } = await response.json();
  document.querySelector("#cooking-total").textContent =
    "You have logged " + stats.totalMeals + " meals cooked at home across " +
    stats.uniqueRecipes + " different recipes.";

  const achievementList = document.querySelector("#achievement-list");
  achievementList.replaceChildren();
  stats.achievements.forEach((achievement) => {
    const article = document.createElement("article");
    const heading = document.createElement("h3");
    const description = document.createElement("p");
    heading.textContent = achievement.name + " × " + achievement.count;
    description.textContent = achievement.description;
    article.append(heading, description);
    achievementList.append(article);
  });

  const recent = document.querySelector("#recent-cooking");
  recent.replaceChildren();
  if (!stats.recent.length) {
    const item = document.createElement("li");
    item.textContent = "Cook a recipe and use the I cooked this dish button to begin.";
    recent.append(item);
    return;
  }
  stats.recent.forEach((entry) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = "/recipes/" + entry.recipeId;
    link.textContent = entry.name;
    item.append(link);
    recent.append(item);
  });
}

async function loadProfile() {
  loadCuisineOptions();
  const response = await fetch("/api/me");

  if (response.status === 401) {
    window.location.href = "/signin";
    return;
  }

  const result = await response.json();
  if (!response.ok) {
    message.textContent = result.error || "The profile could not be loaded.";
    return;
  }

  fillProfile(result.user);
  loadCookingStats();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  const data = new FormData(form);

  try {
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: data.get("name"),
        heightFeet: Number(data.get("heightFeet")),
        heightInches: Number(data.get("heightInches")),
        weightPounds: Number(data.get("weightPounds")),
        gender: data.get("gender"),
        preferences: {
          servings: Number(data.get("preferredServings")),
          cuisine: data.get("preferredCuisine"),
          maxCookTime: Number(data.get("preferredCookTime")),
          minProtein: Number(data.get("preferredProtein"))
        },
        dietaryPreferences: {
          diet: data.get("preferredDiet"),
          avoidedAllergens: data.getAll("avoidedAllergens")
        }
      })
    });
    const result = await response.json();

    if (!response.ok) {
      message.textContent = result.error || "The profile could not be saved.";
      return;
    }

    fillProfile(result.user);
    message.textContent = "Profile saved.";
  } catch {
    message.textContent =
      "CookWise could not reach the profile server. Please try again.";
  }
});

document
  .querySelector("#signout-button")
  .addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/signin";
  });

document
  .querySelector("#delete-password-toggle")
  .addEventListener("click", (event) => {
    const input = document.querySelector("#delete-password");
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    event.currentTarget.textContent = showing
      ? "Show password"
      : "Hide password";
    event.currentTarget.setAttribute("aria-pressed", String(!showing));
  });

document
  .querySelector("#delete-account-button")
  .addEventListener("click", async () => {
    const password = document.querySelector("#delete-password").value;
    const deleteMessage = document.querySelector("#delete-account-message");
    deleteMessage.textContent = "";

    if (!password) {
      deleteMessage.textContent = "Enter your current password first.";
      return;
    }
    if (!window.confirm("Permanently delete your CookWise account? This cannot be undone.")) {
      return;
    }

    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const result = await response.json();
      if (!response.ok) {
        deleteMessage.textContent = result.error || "The account could not be deleted.";
        return;
      }
      window.location.href = "/signup";
    } catch {
      deleteMessage.textContent = "CookWise could not reach the account server.";
    }
  });

loadProfile().catch(() => {
  message.textContent =
    "CookWise could not reach the profile server. Please try again.";
});
