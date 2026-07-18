import { AuthController } from "../auth/auth-controller.js";
import { createAuthShell } from "../auth/auth-shell.js";
import { supabase, supabaseConfigError } from "../auth/supabase-client.js";
import { triangleClient } from "../clients/triangle-client.js";

function renderSetupError(root, error) {
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

export function mountAuthenticatedApplication(root) {
  root.dataset.startupMode = "authenticated";

  if (supabaseConfigError || !supabase) {
    renderSetupError(root, supabaseConfigError);
    return null;
  }

  const authController = new AuthController(supabase);

  return createAuthShell({
    root,
    authController,
    protectedClient: triangleClient
  });
}
