const form = document.querySelector("form[data-mode]");
const message = document.querySelector("#auth-message");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";

  const mode = form.dataset.mode;
  const data = new FormData(form);

  try {
    const response = await fetch("/api/" + mode, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: data.get("username"),
        password: data.get("password")
      })
    });
    const result = await response.json();

    if (!response.ok) {
      message.textContent = result.error || "The request could not be completed.";
      return;
    }

    window.location.href = "profile.html";
  } catch {
    message.textContent =
      "CookWise could not reach the account server. Please try again.";
  }
});
