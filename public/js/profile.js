const form = document.querySelector("#profile-form");
const message = document.querySelector("#profile-message");
const personalContext = document.querySelector("#personal-context");

function renderContext(user) {
  personalContext.replaceChildren();

  if (!user.profileComplete) {
    const prompt = document.createElement("p");
    prompt.textContent =
      "Save all four profile fields to see personal macro context.";
    personalContext.append(prompt);
    return;
  }

  const protein = document.createElement("p");
  const mealProtein = Math.round(user.proteinReference / 3);
  protein.textContent =
    "Illustrative adult protein baseline: about " +
    user.proteinReference +
    " grams per day based on 0.8 grams per kilogram of body weight. Split evenly across three meals, that is about " +
    mealProtein +
    " grams per meal.";

  const limitation = document.createElement("p");
  limitation.textContent =
    "CookWise does not calculate a personal calorie, carbohydrate, or fat target from these fields. Reliable estimates also depend on age, activity, goals, and health information, which this profile intentionally does not ask for.";

  const safety = document.createElement("p");
  safety.textContent =
    "This comparison is general education for healthy adults, not a diagnosis or personal medical plan. Children, teens, pregnant people, athletes, older adults, and people with health conditions may have different needs.";

  personalContext.append(protein, limitation, safety);
}

function fillProfile(user) {
  document.querySelector("#profile-username").textContent = user.username;
  document.querySelector("#name").value = user.name || "";
  document.querySelector("#height").value = user.heightCm || "";
  document.querySelector("#weight").value = user.weightKg || "";
  document.querySelector("#gender").value = user.gender || "";
  renderContext(user);
}

async function loadProfile() {
  const response = await fetch("/api/me");

  if (response.status === 401) {
    window.location.href = "signin.html";
    return;
  }

  const result = await response.json();
  if (!response.ok) {
    message.textContent = result.error || "The profile could not be loaded.";
    return;
  }

  fillProfile(result.user);
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
        heightCm: Number(data.get("heightCm")),
        weightKg: Number(data.get("weightKg")),
        gender: data.get("gender")
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
    window.location.href = "signin.html";
  });

loadProfile().catch(() => {
  message.textContent =
    "CookWise could not reach the profile server. Please try again.";
});
