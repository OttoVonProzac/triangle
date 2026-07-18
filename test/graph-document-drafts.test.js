import assert from "node:assert/strict";
import test from "node:test";
import { GraphController } from "../src/graph/graph-controller.js";
import { createDefaultGraphState } from "../src/graph/graph-state.js";
import { TRIANGLE_NEEDS_MAP_TYPE } from "../src/graph/graph-types.js";
import {
  LocalGraphWorkspacePreferences,
  LocalStorageGraphDocumentDraftRepository
} from "../src/persistence/local-storage-graph-document-repository.js";

function memoryStorage(entries = {}) {
  const values = new Map(Object.entries(entries));

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

test("graph-scoped drafts are isolated by user and graph id", () => {
  const storage = memoryStorage();
  const graphA = createDefaultGraphState();
  const graphB = createDefaultGraphState();
  graphA.content.bubbles["blue-learn"].text = "Graph A";
  graphB.content.bubbles["blue-learn"].text = "Graph B";

  const repoA = new LocalStorageGraphDocumentDraftRepository({
    storage,
    userId: "user-1",
    graphId: "graph-a",
    graphType: TRIANGLE_NEEDS_MAP_TYPE
  });
  const repoB = new LocalStorageGraphDocumentDraftRepository({
    storage,
    userId: "user-1",
    graphId: "graph-b",
    graphType: TRIANGLE_NEEDS_MAP_TYPE
  });
  const repoOtherUser = new LocalStorageGraphDocumentDraftRepository({
    storage,
    userId: "user-2",
    graphId: "graph-a",
    graphType: TRIANGLE_NEEDS_MAP_TYPE
  });

  repoA.save(graphA, { pending: true });
  repoB.save(graphB, { pending: true });

  assert.equal(repoA.load().graph.content.bubbles["blue-learn"].text, "Graph A");
  assert.equal(repoB.load().graph.content.bubbles["blue-learn"].text, "Graph B");
  assert.equal(repoOtherUser.load().exists, false);
});

test("pending local draft newer than remote state is recovered and saved", async () => {
  const storage = memoryStorage();
  const remoteGraph = createDefaultGraphState({
    now: () => new Date("2026-07-18T12:00:00.000Z")
  });
  const draftGraph = createDefaultGraphState({
    now: () => new Date("2026-07-18T13:00:00.000Z")
  });
  draftGraph.content.bubbles["blue-learn"].text = "Recovered pending draft";
  const localRepository = new LocalStorageGraphDocumentDraftRepository({
    storage,
    userId: "user-1",
    graphId: "graph-a",
    graphType: TRIANGLE_NEEDS_MAP_TYPE
  });
  localRepository.save(draftGraph, { pending: true });
  const saves = [];
  const controller = new GraphController({
    remoteRepository: {
      async load() {
        return {
          exists: true,
          graph: remoteGraph
        };
      },
      async save(graph) {
        saves.push(graph);
        return { graph };
      }
    },
    localRepository,
    debounceMs: 1
  });

  await controller.initialize();
  await controller.flush({ timeoutMs: null });

  assert.equal(saves.length, 1);
  assert.equal(
    saves[0].content.bubbles["blue-learn"].text,
    "Recovered pending draft"
  );
  controller.destroy();
});

test("active graph preference is local and independent from index cache", () => {
  const storage = memoryStorage();
  const preferences = new LocalGraphWorkspacePreferences({
    storage,
    userId: "user-1"
  });

  preferences.saveActiveGraphId("graph-a");
  preferences.saveIndexCache([
    {
      id: "11111111-1111-4111-8111-111111111111",
      type: TRIANGLE_NEEDS_MAP_TYPE,
      title: "Triangle",
      createdAt: "2026-07-18T12:00:00.000Z",
      updatedAt: "2026-07-18T12:00:00.000Z"
    }
  ]);

  assert.equal(preferences.loadActiveGraphId(), "graph-a");
  assert.equal(preferences.loadIndexCache().graphs.length, 1);
});
