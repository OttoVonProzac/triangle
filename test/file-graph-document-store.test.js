import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FileGraphDocumentStore } from "../server/persistence/file-graph-document-store.js";
import { TRIANGLE_NEEDS_MAP_TYPE } from "../src/graph/graph-types.js";
import { createDefaultGraphState } from "../src/graph/graph-state.js";

const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "triangle-graph-doc-store-"));
}

test("two graphs for one user remain independent and list summaries match files", async () => {
  const rootDir = await tempRoot();
  const store = new FileGraphDocumentStore({ rootDir });
  const first = await store.createGraph(USER_A, {
    type: TRIANGLE_NEEDS_MAP_TYPE,
    title: "First",
    now: () => new Date("2026-07-18T12:00:00.000Z")
  });
  const second = await store.createGraph(USER_A, {
    type: TRIANGLE_NEEDS_MAP_TYPE,
    title: "Second",
    now: () => new Date("2026-07-18T13:00:00.000Z")
  });
  const firstState = createDefaultGraphState();
  const secondState = createDefaultGraphState();
  firstState.content.bubbles["blue-learn"].text = "First graph";
  secondState.content.bubbles["blue-learn"].text = "Second graph";

  await store.writeGraphState(USER_A, first.id, firstState);
  await store.writeGraphState(USER_A, second.id, secondState);

  assert.equal(
    (await store.readGraph(USER_A, first.id)).graph.state.content.bubbles["blue-learn"].text,
    "First graph"
  );
  assert.equal(
    (await store.readGraph(USER_A, second.id)).graph.state.content.bubbles["blue-learn"].text,
    "Second graph"
  );

  const list = await store.listGraphs(USER_A);
  assert.deepEqual(
    list.graphs.map(summary => summary.id).sort(),
    [first.id, second.id].sort()
  );
});

test("two users remain isolated in separate graph document directories", async () => {
  const rootDir = await tempRoot();
  const store = new FileGraphDocumentStore({ rootDir });
  const graphA = await store.createGraph(USER_A, {
    type: TRIANGLE_NEEDS_MAP_TYPE,
    title: "User A"
  });
  const graphB = await store.createGraph(USER_B, {
    type: TRIANGLE_NEEDS_MAP_TYPE,
    title: "User B"
  });

  assert.notEqual(
    store.graphPathForUser(USER_A, graphA.id),
    store.graphPathForUser(USER_B, graphB.id)
  );
  assert.equal((await store.listGraphs(USER_A)).graphs.length, 1);
  assert.equal((await store.listGraphs(USER_B)).graphs.length, 1);
});

test("legacy graph migrates exactly once and leaves graph.json untouched", async () => {
  const rootDir = await tempRoot();
  const store = new FileGraphDocumentStore({ rootDir });
  const legacy = createDefaultGraphState({
    now: () => new Date("2026-07-18T12:00:00.000Z")
  });
  legacy.content.bubbles["blue-learn"].text = "Legacy graph";
  const userDir = path.join(rootDir, USER_A);
  const legacyPath = path.join(userDir, "graph.json");
  await fs.mkdir(userDir, { recursive: true });
  await fs.writeFile(legacyPath, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");

  const first = await store.listGraphs(USER_A);
  const second = await store.listGraphs(USER_A);

  assert.equal(first.graphs.length, 1);
  assert.equal(second.graphs.length, 1);
  assert.equal(first.graphs[0].id, second.graphs[0].id);
  assert.equal(first.graphs[0].type, TRIANGLE_NEEDS_MAP_TYPE);
  assert.equal(await fs.readFile(legacyPath, "utf8"), `${JSON.stringify(legacy, null, 2)}\n`);

  const migrated = await store.readGraph(USER_A, first.graphs[0].id);
  assert.equal(migrated.graph.state.content.bubbles["blue-learn"].text, "Legacy graph");
});

test("interrupted migration after document write recovers without duplicates", async () => {
  const rootDir = await tempRoot();
  const legacy = createDefaultGraphState();
  const userDir = path.join(rootDir, USER_A);
  await fs.mkdir(userDir, { recursive: true });
  await fs.writeFile(
    path.join(userDir, "graph.json"),
    `${JSON.stringify(legacy, null, 2)}\n`,
    "utf8"
  );

  const failingStore = new FileGraphDocumentStore({
    rootDir,
    filesystem: {
      ...fs,
      async rename(from, to) {
        if (String(to).endsWith("graphs-index.json")) {
          throw new Error("simulated index write failure");
        }
        return fs.rename(from, to);
      }
    }
  });

  await assert.rejects(
    () => failingStore.listGraphs(USER_A),
    /simulated index write failure/
  );

  const recovered = await new FileGraphDocumentStore({ rootDir }).listGraphs(USER_A);
  assert.equal(recovered.graphs.length, 1);
});

test("corrupt index and invalid graph ids fail safely", async () => {
  const rootDir = await tempRoot();
  const store = new FileGraphDocumentStore({ rootDir });
  await fs.mkdir(path.join(rootDir, USER_A), { recursive: true });
  await fs.writeFile(path.join(rootDir, USER_A, "graphs-index.json"), "{bad json", "utf8");

  await assert.rejects(
    () => store.listGraphs(USER_A),
    error => error.code === "corrupt_graph_index"
  );

  assert.throws(
    () => store.graphPathForUser(USER_A, "../outside"),
    /valid UUID/
  );
});
