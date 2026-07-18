import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { graphShellMarkup } from "../src/workspace/graph-shell-layout.js";

test("authenticated graph shell renders graph region and sidebar as siblings", () => {
  const markup = graphShellMarkup({ includeLogout: true });
  const graphIndex = markup.indexOf("auth-shell__client graph-region");
  const sidebarIndex = markup.indexOf("auth-shell__sidebar workspace-sidebar");
  const actionsIndex = markup.indexOf("auth-shell__client-actions");
  const logoutIndex = markup.indexOf("data-auth-logout");

  assert.notEqual(graphIndex, -1);
  assert.notEqual(sidebarIndex, -1);
  assert.ok(graphIndex < sidebarIndex);
  assert.ok(sidebarIndex < actionsIndex);
  assert.ok(actionsIndex < logoutIndex);
  assert.equal(markup.includes("auth-shell__bar"), false);
});

test("demo and standalone indicators live in the sidebar shell", () => {
  const markup = graphShellMarkup({ indicatorText: "Standalone" });
  const indicatorIndex = markup.indexOf("demo-mode-indicator");
  const sidebarIndex = markup.indexOf("auth-shell__sidebar workspace-sidebar");
  const graphIndex = markup.indexOf("auth-shell__client graph-region");

  assert.ok(graphIndex < sidebarIndex);
  assert.ok(sidebarIndex < indicatorIndex);
  assert.match(markup, />Standalone</);
});

test("authenticated layout CSS uses a sidebar grid instead of overlay controls", async () => {
  const css = await readFile("src/styles/auth-shell.css", "utf8");

  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+18rem/);
  assert.match(css, /\.auth-shell__sidebar\{[\s\S]*position:sticky/);
  assert.match(css, /\.auth-shell__client\{[\s\S]*overflow:auto/);
  assert.match(css, /@media \(max-width:\s*900px\)/);
  assert.match(css, /\.auth-shell__sidebar\{[\s\S]*order:-1/);
  assert.doesNotMatch(css, /\.auth-shell__bar\{/);
});

test("startup shells no longer render toolbar controls inside the graph region", async () => {
  const [authShell, demoMain, workspace] = await Promise.all([
    readFile("src/auth/auth-shell.js", "utf8"),
    readFile("src/startup/demo-main.js", "utf8"),
    readFile("src/workspace/graph-workspace.js", "utf8")
  ]);

  assert.doesNotMatch(authShell, /auth-shell__bar/);
  assert.doesNotMatch(demoMain, /auth-shell__bar/);
  assert.match(authShell, /graphShellMarkup\(\{ includeLogout: true \}\)/);
  assert.match(demoMain, /graphShellMarkup\(\{ indicatorText: "Mode demo local" \}\)/);
  assert.match(workspace, /this\.actionsContainer\.replaceChildren\(workspaceControls, exportActions\)/);
});
