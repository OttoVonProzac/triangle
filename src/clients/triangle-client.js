import "../triangle/triangle.css";
import { GraphController } from "../graph/graph-controller.js";
import { LocalStorageGraphRepository } from "../persistence/local-storage-graph-repository.js";
import { RemoteFileGraphRepository } from "../persistence/remote-file-graph-repository.js";
import { mountTriangle } from "../triangle/triangle.js";

let unmountTriangle = null;
let graphController = null;

export const triangleClient = {
  async mount({ container, actionsContainer, session, auth }) {
    if (unmountTriangle) {
      unmountTriangle();
      unmountTriangle = null;
    }

    if (graphController) {
      graphController.destroy();
      graphController = null;
    }

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

    graphController = new GraphController({
      remoteRepository: new RemoteFileGraphRepository({ getAccessToken }),
      localRepository: new LocalStorageGraphRepository({
        userId: session?.user?.id || ""
      })
    });

    await graphController.initialize();
    unmountTriangle = mountTriangle(container, {
      actionsContainer,
      graphController
    });
  },

  async unmount() {
    if (graphController) {
      await graphController.flush({ timeoutMs: 2000 });
    }

    if (unmountTriangle) {
      unmountTriangle();
      unmountTriangle = null;
    }

    if (graphController) {
      graphController.destroy();
      graphController = null;
    }
  }
};

