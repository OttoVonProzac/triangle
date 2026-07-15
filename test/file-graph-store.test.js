import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDefaultGraphState } from "../src/graph/graph-state.js";
import { FileGraphStore } from "../server/persistence/file-graph-store.js";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

async function tempRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), "triangle-graph-store-"));
}

test("missing user file returns exists false", async () => {
  const rootDir = await tempRoot();
  const store = new FileGraphStore({ rootDir });

  const result = await store.readGraph(USER_A);

  assert.deepEqual(result, { exists: false });
});

test("two user ids are isolated into distinct graph files", async () => {
  const rootDir = await tempRoot();
  const store = new FileGraphStore({ rootDir });
  const graphA = createDefaultGraphState();
  const graphB = createDefaultGraphState();
  graphA.content.bubbles["blue-learn"].text = "User A graph";
  graphB.content.bubbles["blue-learn"].text = "User B graph";

  await store.writeGraph(USER_A, graphA);
  await store.writeGraph(USER_B, graphB);

  assert.equal(
    (await store.readGraph(USER_A)).graph.content.bubbles["blue-learn"].text,
    "User A graph"
  );
  assert.equal(
    (await store.readGraph(USER_B)).graph.content.bubbles["blue-learn"].text,
    "User B graph"
  );
  assert.notEqual(store.graphPathForUser(USER_A), store.graphPathForUser(USER_B));
});

test("successful atomic replacement overwrites an existing graph file", async () => {
  const rootDir = await tempRoot();
  const store = new FileGraphStore({ rootDir });
  const original = createDefaultGraphState();
  const replacement = createDefaultGraphState();
  original.content.bubbles["blue-learn"].text = "Original";
  replacement.content.bubbles["blue-learn"].text = "Replacement";

  await store.writeGraph(USER_A, original);
  await store.writeGraph(USER_A, replacement);

  const result = await store.readGraph(USER_A);
  assert.equal(result.graph.content.bubbles["blue-learn"].text, "Replacement");
});

test("path traversal and non-uuid user ids are rejected", async () => {
  const rootDir = await tempRoot();
  const store = new FileGraphStore({ rootDir });

  assert.throws(
    () => store.graphPathForUser("../outside"),
    /valid Supabase UUID/
  );
  assert.throws(
    () => store.graphPathForUser("11111111-1111-1111-1111-111111111111"),
    /valid Supabase UUID/
  );
});

test("atomic replacement preserves previous valid file if rename fails", async () => {
  const rootDir = await tempRoot();
  const baseStore = new FileGraphStore({ rootDir });
  const original = createDefaultGraphState();
  original.content.bubbles["blue-learn"].text = "Original";
  await baseStore.writeGraph(USER_A, original);

  const replacement = createDefaultGraphState();
  replacement.content.bubbles["blue-learn"].text = "Replacement";
  const failingStore = new FileGraphStore({
    rootDir,
    filesystem: {
      ...fs,
      async rename() {
        throw new Error("simulated rename failure");
      }
    },
    randomId: () => "rename-failure"
  });

  await assert.rejects(
    () => failingStore.writeGraph(USER_A, replacement),
    /simulated rename failure/
  );

  const afterFailure = await baseStore.readGraph(USER_A);
  assert.equal(afterFailure.graph.content.bubbles["blue-learn"].text, "Original");

  const files = await fs.readdir(path.join(rootDir, USER_A));
  assert.equal(files.some(file => file.endsWith(".tmp")), false);
});

test("partial temporary files are removed when writeFile fails", async () => {
  const rootDir = await tempRoot();
  const graph = createDefaultGraphState();
  const failingStore = new FileGraphStore({
    rootDir,
    filesystem: {
      ...fs,
      async writeFile(filePath) {
        await fs.writeFile(filePath, "partial", "utf8");
        throw new Error("simulated write failure");
      }
    },
    randomId: () => "write-failure"
  });

  await assert.rejects(
    () => failingStore.writeGraph(USER_A, graph),
    /simulated write failure/
  );

  const files = await fs.readdir(path.join(rootDir, USER_A));
  assert.equal(files.some(file => file.endsWith(".tmp")), false);
});

test("corrupted graph files return a clear error and are not replaced", async () => {
  const rootDir = await tempRoot();
  const store = new FileGraphStore({ rootDir });
  await fs.mkdir(path.join(rootDir, USER_A), { recursive: true });
  const graphPath = path.join(rootDir, USER_A, "graph.json");
  await fs.writeFile(graphPath, "{not valid json", "utf8");

  await assert.rejects(
    () => store.readGraph(USER_A),
    error => error.code === "corrupt_graph_file"
  );

  assert.equal(await fs.readFile(graphPath, "utf8"), "{not valid json");
});
