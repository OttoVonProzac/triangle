import { assertProtectedClient } from "../clients/protected-client.js";
import { createAuthView } from "./auth-view.js";

const STATE = {
  BOOTING: "BOOTING",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  AUTHENTICATED: "AUTHENTICATED",
  ERROR: "ERROR"
};

function logTechnicalError(error) {
  if (import.meta.env?.DEV) {
    console.error(error);
  }
}

export function createAuthShell({ root, authController, protectedClient }) {
  if (!root) {
    throw new Error("createAuthShell requires a root element.");
  }

  assertProtectedClient(protectedClient);

  let state = STATE.BOOTING;
  let booting = true;
  let destroyed = false;
  let authView = null;
  let clientMounted = false;
  let clientMounting = false;
  let clientContainer = null;
  let authUnsubscribe = null;
  let currentSession = null;
  let mountGeneration = 0;
  let authAction = null;

  function setState(nextState) {
    state = nextState;
    root.dataset.authState = state;
  }

  function destroyAuthView() {
    if (authView) {
      authView.destroy();
      authView = null;
    }
  }

  async function unmountProtectedClient() {
    mountGeneration += 1;

    if (!clientMounted && !clientMounting) {
      if (clientContainer) {
        clientContainer.replaceChildren();
      }
      return;
    }

    try {
      if (protectedClient.unmount) {
        await protectedClient.unmount();
      }
    } catch (error) {
      logTechnicalError(error);
    } finally {
      clientMounted = false;
      clientMounting = false;
      currentSession = null;

      if (clientContainer) {
        clientContainer.replaceChildren();
      }
    }
  }

  function renderBooting() {
    setState(STATE.BOOTING);
    root.innerHTML = `
      <main class="auth-shell auth-shell--booting">
        <p class="auth-loading">Opening Triangle...</p>
      </main>
    `;
  }

  function renderShellError(message) {
    setState(STATE.ERROR);
    destroyAuthView();

    root.innerHTML = `
      <main class="auth-shell auth-shell--error">
        <section class="auth-card" aria-labelledby="auth-error-title">
          <h1 id="auth-error-title">Triangle</h1>
          <p class="auth-status" data-tone="error">${message}</p>
          <button class="auth-secondary" type="button" data-auth-logout>
            Log out
          </button>
        </section>
      </main>
    `;

    root.querySelector("[data-auth-logout]").addEventListener("click", handleLogout);
  }

  async function showUnauthenticated() {
    if (destroyed) {
      return;
    }

    await unmountProtectedClient();
    destroyAuthView();
    setState(STATE.UNAUTHENTICATED);

    root.innerHTML = `
      <main class="auth-shell auth-shell--unauthenticated">
        <div class="auth-view-host"></div>
      </main>
    `;

    authView = createAuthView({
      container: root.querySelector(".auth-view-host"),
      onLogin: handleLogin,
      onSignup: handleSignup
    });
  }

  async function showAuthenticated(session) {
    if (destroyed || !session) {
      return;
    }

    currentSession = session;

    if (clientMounted || clientMounting) {
      setState(STATE.AUTHENTICATED);
      return;
    }

    destroyAuthView();
    setState(STATE.AUTHENTICATED);

    root.innerHTML = `
      <main class="auth-shell auth-shell--authenticated">
        <div class="auth-shell__bar">
          <div class="auth-shell__client-actions"></div>
          <button class="auth-logout" type="button" data-auth-logout>
            Log out
          </button>
        </div>
        <div class="auth-shell__client"></div>
      </main>
    `;

    root.querySelector("[data-auth-logout]").addEventListener("click", handleLogout);
    clientContainer = root.querySelector(".auth-shell__client");
    clientMounting = true;
    const activeMountGeneration = ++mountGeneration;

    try {
      await protectedClient.mount({
        actionsContainer: root.querySelector(".auth-shell__client-actions"),
        container: clientContainer,
        session,
        auth: authController
      });

      if (destroyed || activeMountGeneration !== mountGeneration) {
        try {
          if (protectedClient.unmount) {
            await protectedClient.unmount();
          }
        } catch (cleanupError) {
          logTechnicalError(cleanupError);
        }
        return;
      }

      clientMounted = true;
    } catch (error) {
      logTechnicalError(error);
      clientMounted = false;
      try {
        if (protectedClient.unmount) {
          await protectedClient.unmount();
        }
      } catch (cleanupError) {
        logTechnicalError(cleanupError);
      }
      renderShellError("The protected application could not be opened.");
    } finally {
      clientMounting = false;
    }
  }

  async function handleLogin({ email, password }, view) {
    authAction = "signing-in";
    const result = await authController.signIn(email, password);

    if (!result.ok) {
      authAction = null;
      view.setMessage(result.error.message, "error");
      return;
    }

    if (!result.session) {
      authAction = null;
      view.setMessage("Session unavailable. Try signing in again.", "error");
      return;
    }

    await showAuthenticated(result.session);
    authAction = null;
  }

  async function handleSignup({ email, password }, view) {
    authAction = "signing-in";
    const result = await authController.signUp(email, password);

    if (!result.ok) {
      authAction = null;
      view.setMessage(result.error.message, "error");
      return;
    }

    if (!result.session) {
      authAction = null;
      view.setMessage(
        "Account created. Check your email before signing in.",
        "info"
      );
      return;
    }

    await showAuthenticated(result.session);
    authAction = null;
  }

  async function handleLogout() {
    authAction = "signing-out";
    await unmountProtectedClient();

    const result = await authController.signOut();

    if (!result.ok) {
      authAction = null;
      renderShellError(result.error.message);
      return;
    }

    await showUnauthenticated();
    authAction = null;
  }

  function handleAuthStateChange(event, session) {
    if (destroyed || (booting && event === "INITIAL_SESSION")) {
      return;
    }

    if (event === "SIGNED_OUT" || !session) {
      if (authAction === "signing-out") {
        return;
      }
      showUnauthenticated();
      return;
    }

    if (
      event === "SIGNED_IN" ||
      event === "TOKEN_REFRESHED" ||
      event === "USER_UPDATED" ||
      event === "INITIAL_SESSION"
    ) {
      if (authAction === "signing-in" && event === "SIGNED_IN") {
        return;
      }
      showAuthenticated(session);
    }
  }

  async function boot() {
    renderBooting();
    authUnsubscribe = authController.onAuthStateChange(handleAuthStateChange);

    const result = await authController.getSession();
    booting = false;

    if (!result.ok) {
      await showUnauthenticated();
      return;
    }

    if (result.session) {
      await showAuthenticated(result.session);
      return;
    }

    await showUnauthenticated();
  }

  boot();

  return {
    async destroy() {
      destroyed = true;
      destroyAuthView();

      if (authUnsubscribe) {
        authUnsubscribe();
      }

      await unmountProtectedClient();
      root.replaceChildren();
    }
  };
}
