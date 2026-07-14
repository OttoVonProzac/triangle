const MIN_PASSWORD_LENGTH = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getCredentials(emailInput, passwordInput) {
  return {
    email: emailInput.value.trim(),
    password: passwordInput.value
  };
}

function validateCredentials({ email, password }) {
  if (!EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address.";
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return "Password must contain at least 6 characters.";
  }

  return "";
}

export function createAuthView({ container, onLogin, onSignup }) {
  let destroyed = false;

  container.innerHTML = `
    <section class="auth-card" aria-labelledby="auth-title">
      <h1 id="auth-title">Triangle</h1>
      <form class="auth-form" novalidate>
        <div class="auth-field">
          <label for="auth-email">Email</label>
          <input
            id="auth-email"
            name="email"
            type="email"
            autocomplete="email"
            required
          >
        </div>

        <div class="auth-field">
          <label for="auth-password">Password</label>
          <input
            id="auth-password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
            minlength="${MIN_PASSWORD_LENGTH}"
          >
        </div>

        <div class="auth-actions">
          <button class="auth-primary" type="submit">Log in</button>
          <button class="auth-secondary" type="button" data-auth-signup>
            Create account
          </button>
        </div>

        <p class="auth-status" role="status" aria-live="polite"></p>
      </form>
    </section>
  `;

  const form = container.querySelector(".auth-form");
  const emailInput = container.querySelector("#auth-email");
  const passwordInput = container.querySelector("#auth-password");
  const loginButton = container.querySelector(".auth-primary");
  const signupButton = container.querySelector("[data-auth-signup]");
  const status = container.querySelector(".auth-status");

  function setBusy(isBusy) {
    loginButton.disabled = isBusy;
    signupButton.disabled = isBusy;
    emailInput.disabled = isBusy;
    passwordInput.disabled = isBusy;
    container.classList.toggle("is-busy", isBusy);
  }

  function setMessage(message, tone = "info") {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  async function request(action) {
    const credentials = getCredentials(emailInput, passwordInput);
    const validationMessage = validateCredentials(credentials);

    if (validationMessage) {
      setMessage(validationMessage, "error");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      await action(credentials, view);
    } finally {
      if (!destroyed) {
        setBusy(false);
      }
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    request(onLogin);
  }

  function handleSignup() {
    request(onSignup);
  }

  const view = {
    setBusy,
    setMessage,
    destroy() {
      destroyed = true;
      form.removeEventListener("submit", handleSubmit);
      signupButton.removeEventListener("click", handleSignup);
      container.replaceChildren();
    }
  };

  form.addEventListener("submit", handleSubmit);
  signupButton.addEventListener("click", handleSignup);
  emailInput.focus();

  return view;
}

