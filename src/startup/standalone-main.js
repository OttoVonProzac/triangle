import { TRIANGLE_NEEDS_MAP_TYPE } from "../graph/graph-types.js";
import { triangleNeedsMapAdapter } from "../graph-types/triangle-needs-map-adapter.js";
import {
  BrowserGraphDocumentRepository,
  LocalGraphWorkspacePreferences
} from "../persistence/local-storage-graph-document-repository.js";
import {
  graphShellElements,
  graphShellMarkup
} from "../workspace/graph-shell-layout.js";
import { GraphWorkspace } from "../workspace/graph-workspace.js";

export const STANDALONE_STORAGE_KEYS = Object.freeze({
  active: "triangle-standalone-active-v1",
  documentPrefix: "triangle-standalone-document-v1",
  index: "triangle-standalone-index-v1"
});

let standaloneWorkspace = null;

async function destroyStandaloneWorkspace() {
  if (standaloneWorkspace) {
    await standaloneWorkspace.destroy();
    standaloneWorkspace = null;
  }
}

export function renderStandaloneStartupError(root) {
  root.innerHTML = `
    <main class="setup-error">
      <section class="auth-card" aria-labelledby="standalone-error-title">
        <h1 id="standalone-error-title">Triangle</h1>
        <p class="auth-status" data-tone="error">
          Triangle standalone could not be opened. Open the browser console for details.
        </p>
      </section>
    </main>
  `;
}

export async function mountStandaloneApplication(
  root,
  {
    storage = globalThis.localStorage,
    now = () => new Date(),
    randomId = undefined
  } = {}
) {
  if (!root) {
    throw new Error("Triangle standalone requires an #app root element.");
  }

  await destroyStandaloneWorkspace();
  root.dataset.startupMode = "standalone";
  root.innerHTML = graphShellMarkup({ indicatorText: "Standalone" });
  const { actionsContainer, clientContainer } = graphShellElements(root);

  standaloneWorkspace = new GraphWorkspace({
    container: clientContainer,
    actionsContainer,
    graphRepository: new BrowserGraphDocumentRepository({
      storage,
      userId: "standalone",
      indexKey: STANDALONE_STORAGE_KEYS.index,
      documentKeyPrefix: STANDALONE_STORAGE_KEYS.documentPrefix,
      now,
      ...(randomId ? { randomId } : {})
    }),
    graphAdapters: [triangleNeedsMapAdapter],
    defaultGraphType: TRIANGLE_NEEDS_MAP_TYPE,
    userId: "standalone",
    storage,
    preferences: new LocalGraphWorkspacePreferences({
      storage,
      userId: "standalone",
      activeKey: STANDALONE_STORAGE_KEYS.active,
      indexCacheKey: STANDALONE_STORAGE_KEYS.index
    }),
    now
  });

  await standaloneWorkspace.mount();
  return standaloneWorkspace;
}

export async function unmountStandaloneApplication() {
  await destroyStandaloneWorkspace();
}
