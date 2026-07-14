import "./styles/app.css";
import "./styles/auth-shell.css";
import { AuthController } from "./auth/auth-controller.js";
import { createAuthShell } from "./auth/auth-shell.js";
import { supabase, supabaseConfigError } from "./auth/supabase-client.js";
import { triangleClient } from "./clients/triangle-client.js";

const root = document.querySelector("#app");

function renderSetupError(error) {
  const main = document.createElement("main");
  main.className = "setup-error";

  const section = document.createElement("section");
  section.className = "auth-card";
  section.setAttribute("aria-labelledby", "setup-error-title");

  const title = document.createElement("h1");
  title.id = "setup-error-title";
  title.textContent = "Triangle";

  const message = document.createElement("p");
  message.className = "auth-status";
  message.dataset.tone = "error";
  message.textContent = error.message;

  section.append(title, message);
  main.append(section);
  root.replaceChildren(main);
}

if (!root) {
  throw new Error("Missing #app root element.");
}

if (supabaseConfigError || !supabase) {
  renderSetupError(supabaseConfigError);
} else {
  const authController = new AuthController(supabase);

  createAuthShell({
    root,
    authController,
    protectedClient: triangleClient
  });
}
