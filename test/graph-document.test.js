import assert from "node:assert/strict";
import test from "node:test";
import {
  createGraphDocument,
  graphSummaryFromDocument,
  normalizeGraphTitle,
  renameGraphDocument
} from "../src/graph/graph-document.js";
import { TRIANGLE_NEEDS_MAP_TYPE } from "../src/graph/graph-types.js";
import { createDefaultGraphState } from "../src/graph/graph-state.js";

const GRAPH_ID = "11111111-1111-4111-8111-111111111111";

test("graph document validation accepts registered graph type and canonical state", () => {
  const state = createDefaultGraphState({
    now: () => new Date("2026-07-18T12:00:00.000Z")
  });
  const document = createGraphDocument({
    id: GRAPH_ID,
    type: TRIANGLE_NEEDS_MAP_TYPE,
    title: "  Triangle initial  ",
    state,
    now: () => new Date("2026-07-18T12:00:00.000Z")
  });

  assert.equal(document.schemaVersion, 1);
  assert.equal(document.id, GRAPH_ID);
  assert.equal(document.type, TRIANGLE_NEEDS_MAP_TYPE);
  assert.equal(document.title, "Triangle initial");
  assert.equal(document.state.graphId, "triangle");
});

test("graph document validation rejects invalid ids, types, and titles", () => {
  assert.throws(
    () =>
      createGraphDocument({
        id: "../outside",
        type: TRIANGLE_NEEDS_MAP_TYPE,
        title: "Triangle"
      }),
    /valid UUID/
  );

  assert.throws(
    () =>
      createGraphDocument({
        id: GRAPH_ID,
        type: "unknown-graph",
        title: "Triangle"
      }),
    /Unsupported graph type/
  );

  assert.throws(
    () => normalizeGraphTitle("   "),
    /cannot be empty/
  );
});

test("renaming changes only metadata and preserves graph identity", () => {
  const state = createDefaultGraphState();
  state.content.bubbles["blue-learn"].text = "Original";
  const document = createGraphDocument({
    id: GRAPH_ID,
    type: TRIANGLE_NEEDS_MAP_TYPE,
    title: "Before",
    state,
    now: () => new Date("2026-07-18T12:00:00.000Z")
  });

  const renamed = renameGraphDocument(document, "After", {
    now: () => new Date("2026-07-18T13:00:00.000Z")
  });

  assert.equal(renamed.id, document.id);
  assert.equal(renamed.type, document.type);
  assert.equal(renamed.title, "After");
  assert.equal(renamed.state.content.bubbles["blue-learn"].text, "Original");
  assert.equal(renamed.updatedAt, "2026-07-18T13:00:00.000Z");
});

test("graph summaries contain deterministic metadata only", () => {
  const document = createGraphDocument({
    id: GRAPH_ID,
    type: TRIANGLE_NEEDS_MAP_TYPE,
    title: "Triangle",
    now: () => new Date("2026-07-18T12:00:00.000Z")
  });

  assert.deepEqual(graphSummaryFromDocument(document), {
    id: GRAPH_ID,
    type: TRIANGLE_NEEDS_MAP_TYPE,
    title: "Triangle",
    createdAt: "2026-07-18T12:00:00.000Z",
    updatedAt: "2026-07-18T12:00:00.000Z"
  });
});
