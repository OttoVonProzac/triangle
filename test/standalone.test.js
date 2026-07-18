import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderStandaloneHtml } from "../scripts/build-standalone.js";
import { createDefaultGraphState } from "../src/graph/graph-state.js";
import { TRIANGLE_NEEDS_MAP_TYPE } from "../src/graph/graph-types.js";
import {
  BrowserGraphDocumentRepository,
  LocalGraphWorkspacePreferences
} from "../src/persistence/local-storage-graph-document-repository.js";

const GRAPH_ID = "22222222-2222-4222-8222-222222222222";

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

test("standalone sources avoid Supabase and remote graph APIs", async () => {
  const [entry, startup] = await Promise.all([
    readFile("src/standalone-main.js", "utf8"),
    readFile("src/startup/standalone-main.js", "utf8")
  ]);
  const source = `${entry}\n${startup}`;

  assert.doesNotMatch(source, /supabase/i);
  assert.doesNotMatch(source, /\/api\/graphs/);
  assert.doesNotMatch(source, /RemoteGraphDocumentRepository/);
  assert.match(source, /BrowserGraphDocumentRepository/);
  assert.match(source, /triangleNeedsMapAdapter/);
  assert.match(source, /Triangle standalone could not be opened/);
});

test("standalone local repository uses standalone keys and preserves edits", () => {
  const storage = memoryStorage();
  const repository = new BrowserGraphDocumentRepository({
    storage,
    userId: "standalone",
    indexKey: "triangle-standalone-index-v1",
    documentKeyPrefix: "triangle-standalone-document-v1",
    randomId: () => GRAPH_ID,
    now: () => new Date("2026-07-18T12:00:00.000Z")
  });

  const created = repository.createGraph({ type: TRIANGLE_NEEDS_MAP_TYPE }).graph;
  const nextState = createDefaultGraphState({
    now: () => new Date("2026-07-18T12:01:00.000Z")
  });
  nextState.content.bubbles["blue-learn"].text = "Standalone edit";

  repository.saveGraphState(created.id, nextState);
  const loaded = repository.loadGraph(GRAPH_ID).graph;

  assert.ok(storage.getItem("triangle-standalone-index-v1"));
  assert.ok(storage.getItem(`triangle-standalone-document-v1:${GRAPH_ID}`));
  assert.equal(
    loaded.state.content.bubbles["blue-learn"].text,
    "Standalone edit"
  );
});

test("standalone active graph preference uses the standalone active key", () => {
  const storage = memoryStorage();
  const preferences = new LocalGraphWorkspacePreferences({
    storage,
    userId: "standalone",
    activeKey: "triangle-standalone-active-v1",
    indexCacheKey: "triangle-standalone-index-v1"
  });

  preferences.saveActiveGraphId(GRAPH_ID);

  assert.equal(
    storage.getItem("triangle-standalone-active-v1"),
    GRAPH_ID
  );
});

test("standalone HTML renderer creates a self-contained file-compatible page", () => {
  const html = renderStandaloneHtml({
    css: "body{color:#171a22}",
    js: "window.__triangleStandaloneTest = true;"
  });

  assert.match(html, /<style>/);
  assert.match(html, /<script>/);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i);
  assert.doesNotMatch(html, /<link\b[^>]*\bhref=/i);
  assert.doesNotMatch(html, /\/src\/main\.js/i);
  assert.doesNotMatch(html, /\/assets\//i);
  assert.doesNotMatch(html, /\bsrc="\//i);
  assert.doesNotMatch(html, /\bhref="\//i);
});

test("standalone build script inlines one IIFE bundle from the real entry", async () => {
  const script = await readFile("scripts/build-standalone.js", "utf8");

  assert.match(script, /src", "standalone-main\.js"/);
  assert.match(script, /inlineDynamicImports:\s*true/);
  assert.match(script, /format:\s*"iife"/);
  assert.match(script, /triangle-standalone\.html/);
});
