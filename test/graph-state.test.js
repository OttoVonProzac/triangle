import assert from "node:assert/strict";
import test from "node:test";
import { GraphController } from "../src/graph/graph-controller.js";
import {
  createDefaultGraphState,
  DEFAULT_BUBBLE_TEXTS,
  GRAPH_ID,
  GRAPH_SCHEMA_VERSION,
  MAX_BUBBLE_TEXT_LENGTH,
  validateGraphState
} from "../src/graph/graph-state.js";
import { LocalStorageGraphRepository } from "../src/persistence/local-storage-graph-repository.js";

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

test("legacy localStorage migration converts stable bubble ids to canonical graph state", async () => {
  const storage = memoryStorage({
    "child-development-map-v5": JSON.stringify({
      "blue-learn": "Migrated text",
      "teal-home": "Migrated home"
    })
  });
  const repository = new LocalStorageGraphRepository({
    storage,
    now: () => new Date("2026-07-15T00:00:00.000Z")
  });

  const result = await repository.load();

  assert.equal(result.exists, true);
  assert.equal(result.graph.schemaVersion, GRAPH_SCHEMA_VERSION);
  assert.equal(result.graph.graphId, GRAPH_ID);
  assert.equal(result.graph.content.bubbles["blue-learn"].text, "Migrated text");
  assert.equal(result.graph.content.bubbles["teal-home"].text, "Migrated home");
  assert.equal(
    result.graph.content.bubbles["blue-health"].text,
    DEFAULT_BUBBLE_TEXTS["blue-health"]
  );
});

test("controller initializes default graph state when no remote or legacy state exists", async () => {
  const saves = [];
  const controller = new GraphController({
    remoteRepository: {
      async load() {
        return { exists: false };
      },
      async save(graph) {
        saves.push(graph);
        return { graph };
      }
    },
    localRepository: {
      load() {
        return { exists: false };
      },
      save(graph) {
        return { graph };
      }
    },
    now: () => new Date("2026-07-15T00:00:00.000Z")
  });

  const graph = await controller.initialize();
  controller.destroy();

  assert.equal(graph.schemaVersion, GRAPH_SCHEMA_VERSION);
  assert.equal(graph.graphId, GRAPH_ID);
  assert.equal(
    graph.content.bubbles["violet-care"].text,
    DEFAULT_BUBBLE_TEXTS["violet-care"]
  );
  assert.equal(saves.length, 0);
});

test("graph validation rejects unknown bubble ids", () => {
  const graph = createDefaultGraphState();
  graph.content.bubbles["unknown-bubble"] = { text: "Nope" };

  const result = validateGraphState(graph);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "unknown_bubble_id");
});

test("graph validation rejects non-string and oversized bubble text", () => {
  const nonString = createDefaultGraphState();
  nonString.content.bubbles["blue-learn"] = { text: 42 };

  const nonStringResult = validateGraphState(nonString);
  assert.equal(nonStringResult.ok, false);
  assert.equal(nonStringResult.error.code, "invalid_bubble_text");

  const oversized = createDefaultGraphState();
  oversized.content.bubbles["blue-learn"] = {
    text: "x".repeat(MAX_BUBBLE_TEXT_LENGTH + 1)
  };

  const oversizedResult = validateGraphState(oversized);
  assert.equal(oversizedResult.ok, false);
  assert.equal(oversizedResult.error.code, "bubble_text_too_large");
});

test("graph validation rejects unsupported schema versions and graph ids", () => {
  const badVersion = createDefaultGraphState();
  badVersion.schemaVersion = 999;
  assert.equal(validateGraphState(badVersion).error.code, "unsupported_schema_version");

  const badGraphId = createDefaultGraphState();
  badGraphId.graphId = "other";
  assert.equal(validateGraphState(badGraphId).error.code, "unexpected_graph_id");
});
