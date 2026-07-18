import { LEGACY_LOCAL_STORAGE_KEY } from "../graph/graph-state.js";
import { TRIANGLE_NEEDS_MAP_TYPE } from "../graph/graph-types.js";
import { triangleNeedsMapAdapter } from "../graph-types/triangle-needs-map-adapter.js";
import { LOCAL_DRAFT_STORAGE_KEY_PREFIX } from "../persistence/local-storage-graph-repository.js";
import {
  BrowserGraphDocumentRepository
} from "../persistence/local-storage-graph-document-repository.js";
import {
  RemoteGraphDocumentRepository,
  ResilientGraphDocumentRepository
} from "../persistence/remote-graph-document-repository.js";
import { GraphWorkspace } from "../workspace/graph-workspace.js";

let graphWorkspace = null;

async function destroyWorkspace() {
  if (graphWorkspace) {
    await graphWorkspace.destroy();
    graphWorkspace = null;
  }
}

function legacyDraftKeysForUser(userId) {
  return [
    ...(userId ? [`${LOCAL_DRAFT_STORAGE_KEY_PREFIX}:${userId}`] : []),
    LEGACY_LOCAL_STORAGE_KEY
  ];
}

function logAuthenticatedFallback({ error, operation }) {
  console.warn("Authenticated graph repository fell back to local documents", {
    operation,
    error,
    stack: error?.stack,
    startupMode: "authenticated"
  });
}

export const triangleClient = {
  async mount({ container, actionsContainer, session, auth }) {
    await destroyWorkspace();

    const getAccessToken = async () => {
      const result = await auth.getSession();
      const accessToken =
        result.ok && result.session?.access_token
          ? result.session.access_token
          : session?.access_token;

      if (!accessToken) {
        throw new Error("Authenticated graph requests require an access token.");
      }

      return accessToken;
    };
    const userId = session?.user?.id || "";
    const remoteRepository = new RemoteGraphDocumentRepository({ getAccessToken });
    const fallbackRepository = new BrowserGraphDocumentRepository({
      userId: userId ? `auth-local:${userId}` : "auth-local"
    });

    graphWorkspace = new GraphWorkspace({
      container,
      actionsContainer,
      graphRepository: new ResilientGraphDocumentRepository({
        primaryRepository: remoteRepository,
        fallbackRepository,
        onFallback: logAuthenticatedFallback
      }),
      graphAdapters: [triangleNeedsMapAdapter],
      defaultGraphType: TRIANGLE_NEEDS_MAP_TYPE,
      userId,
      legacyDraftKeys: legacyDraftKeysForUser(userId)
    });

    await graphWorkspace.mount();
  },

  async unmount() {
    await destroyWorkspace();
  }
};

export const triangleDemoClient = {
  async mount({ container, actionsContainer }) {
    await destroyWorkspace();

    const userId = "demo-local";
    graphWorkspace = new GraphWorkspace({
      container,
      actionsContainer,
      graphRepository: new BrowserGraphDocumentRepository({ userId }),
      graphAdapters: [triangleNeedsMapAdapter],
      defaultGraphType: TRIANGLE_NEEDS_MAP_TYPE,
      userId,
      legacyDraftKeys: [LEGACY_LOCAL_STORAGE_KEY]
    });

    await graphWorkspace.mount();
  },

  async unmount() {
    await destroyWorkspace();
  }
};
