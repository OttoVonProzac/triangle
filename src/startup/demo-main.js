import { triangleDemoClient } from "../clients/triangle-client.js";
import {
  graphShellElements,
  graphShellMarkup
} from "../workspace/graph-shell-layout.js";

function renderDemoStartupError(root) {
  root.innerHTML = `
    <main class="setup-error">
      <section class="auth-card" aria-labelledby="demo-error-title">
        <h1 id="demo-error-title">Triangle</h1>
        <p class="auth-status" data-tone="error">
          Triangle demo could not be opened. Open the browser console for details.
        </p>
      </section>
    </main>
  `;
}

export async function mountDemoApplication(root) {
  root.dataset.startupMode = "demo";
  root.innerHTML = graphShellMarkup({ indicatorText: "Mode demo local" });
  const { actionsContainer, clientContainer } = graphShellElements(root);

  try {
    await triangleDemoClient.mount({
      actionsContainer,
      container: clientContainer
    });
  } catch (error) {
    console.error("Triangle demo startup failed", {
      error,
      stack: error?.stack,
      startupMode: "demo"
    });
    renderDemoStartupError(root);
  }
}
