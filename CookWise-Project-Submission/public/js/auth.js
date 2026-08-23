const form = document.querySelector("form[data-mode]");
const message = document.querySelector("#auth-message");

document.querySelectorAll(".password-toggle").forEach((button) => {
  button.addEventListener("click", () => {
    const input = document.querySelector(
      "#" + button.dataset.passwordTarget
    );
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    button.textContent = showing ? "Show password" : "Hide password";
    button.setAttribute("aria-pressed", String(!showing));
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";

  const mode = form.dataset.mode;
  const data = new FormData(form);

  if (
    mode === "signup" &&
    data.get("password") !== data.get("confirmPassword")
  ) {
    message.textContent = "Passwords do not match.";
    return;
  }

  try {
    const response = await fetch("/api/" + mode, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: data.get("username"),
        password: data.get("password"),
        confirmPassword: data.get("confirmPassword")
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
