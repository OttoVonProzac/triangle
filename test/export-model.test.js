import assert from "node:assert/strict";
import test from "node:test";
import {
  buildJsonExport,
  buildMarkdownExport,
  buildPlainTextExport
} from "../src/export/export-formatters.js";
import { buildExportModel } from "../src/export/export-model.js";
import { exportFilename, sanitizeFilenameSegment } from "../src/export/export-service.js";
import { createGraphDocument } from "../src/graph/graph-document.js";
import { TRIANGLE_NEEDS_MAP_TYPE } from "../src/graph/graph-types.js";
import { createDefaultGraphState } from "../src/graph/graph-state.js";

test("export model groups canonical graph state into stable sections", () => {
  const graph = createDefaultGraphState({
    now: () => new Date("2026-07-18T00:00:00.000Z")
  });
  graph.content.bubbles["blue-health"].text = "Santé physique";
  graph.content.bubbles["blue-relations"].text = "Ma relation\navec les autres";

  const model = buildExportModel(graph);

  assert.equal(model.title, "Triangle des besoins");
  assert.deepEqual(
    model.sections.map(section => section.title),
    ["Développement de l'enfant", "Rôle parental", "Environnement"]
  );
  assert.deepEqual(
    model.sections[0].bubbles.map(bubble => bubble.id),
    [
      "blue-learn",
      "blue-health",
      "blue-identity",
      "blue-relations",
      "blue-family"
    ]
  );
  assert.equal(model.sections[0].bubbles[1].title, "Santé physique");
  assert.equal(
    model.sections[0].bubbles[3].title,
    "Ma relation avec les autres"
  );
});

test("markdown export is a readable hierarchy", () => {
  const graph = createDefaultGraphState();
  graph.content.bubbles["teal-home"].text = "Logement stable";

  const markdown = buildMarkdownExport(buildExportModel(graph));

  assert.match(markdown, /^# Triangle des besoins\n\n/);
  assert.match(markdown, /## Développement de l'enfant\n\n### Apprendre, découvrir/);
  assert.match(markdown, /## Environnement\n\n### Histoire et fonctionnement familial/);
  assert.match(markdown, /### Logement stable/);
});

test("json export serializes the canonical graph state", () => {
  const graph = createDefaultGraphState({
    now: () => new Date("2026-07-18T00:00:00.000Z")
  });
  graph.content.bubbles["blue-health"].text = "Santé";

  const parsed = JSON.parse(buildJsonExport(graph));

  assert.deepEqual(parsed, graph);
});

test("json export can serialize a complete generic graph document", () => {
  const graph = createDefaultGraphState({
    now: () => new Date("2026-07-18T00:00:00.000Z")
  });
  const document = createGraphDocument({
    id: "11111111-1111-4111-8111-111111111111",
    type: TRIANGLE_NEEDS_MAP_TYPE,
    title: "Triangle de Lea",
    state: graph,
    now: () => new Date("2026-07-18T00:00:00.000Z")
  });

  const parsed = JSON.parse(buildJsonExport(document));

  assert.equal(parsed.id, document.id);
  assert.equal(parsed.type, TRIANGLE_NEEDS_MAP_TYPE);
  assert.equal(parsed.title, "Triangle de Lea");
  assert.deepEqual(parsed.state, graph);
});

test("plain text export is clipboard-friendly", () => {
  const graph = createDefaultGraphState();
  graph.content.bubbles["violet-care"].text = "Soins quotidiens";

  const text = buildPlainTextExport(buildExportModel(graph));

  assert.match(text, /^Triangle des besoins\n\n/);
  assert.match(text, /Rôle parental\n- Soins quotidiens/);
  assert.match(text, /Environnement\n- Histoire et fonctionnement familial/);
});

test("export filenames use sanitized active graph titles with date fallback", () => {
  assert.equal(
    sanitizeFilenameSegment("Triangle de Lea - juillet 2026"),
    "triangle-de-lea-juillet-2026"
  );
  assert.equal(
    exportFilename("pdf", {
      title: "Triangle de Lea - juillet 2026",
      now: () => new Date("2026-07-18T00:00:00.000Z")
    }),
    "triangle-de-lea-juillet-2026.pdf"
  );
  assert.equal(
    exportFilename("json", {
      title: "",
      now: () => new Date("2026-07-18T00:00:00.000Z")
    }),
    "triangle-2026-07-18.json"
  );
});
