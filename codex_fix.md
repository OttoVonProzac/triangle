# CODEX_FIX.md — Triangle MVP 1.2 Blocking Fix Pass

Read the current repository state first.

Do not redesign the graph.

Do not generate images.

Do not commit.

There are two remaining blocking regressions:

1. The standalone HTML still does not work.
2. The authenticated toolbar overlaps the graph bubbles.

The save and multi-graph features currently work and must not regress.

---

# 1. Fix the authenticated UI layout

Current problem:

The toolbar is rendered horizontally across the top of the page, directly over the upper bubbles.

Observed controls:

```text
[ Triangle du 2026-07-18 ▾ ] [ Nouveau ] [ Renommer ] [ PDF ▾ ] [ Export ] [ Log out ]
```

This obscures the graph and causes labels and bubbles to sit underneath the controls.

## Required layout

Move the authenticated graph controls into a dedicated vertical sidebar on the right.

The controls must be outside the graph drawing zone.

Target structure:

```text
┌─────────────────────────────────────────────┬──────────────────┐
│                                             │ Triangle title ▾ │
│                                             │ Nouveau          │
│              GRAPH / BUBBLES                │ Renommer         │
│                                             │ PDF ▾            │
│                                             │ Export           │
│                                             │ Log out          │
│                                             │                  │
└─────────────────────────────────────────────┴──────────────────┘
```

The graph must never render underneath the sidebar.

## Layout requirements

Use a real page layout, not absolute-positioned controls over the graph.

Preferred direction:

```css
.app-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18rem;
  min-height: 100vh;
}

.graph-region {
  min-width: 0;
  overflow: auto;
}

.workspace-sidebar {
  position: sticky;
  top: 0;
  align-self: start;
  height: 100vh;
}
```

Adjust class names to the repository.

Requirements:

- graph region and sidebar are siblings;
- graph region owns all bubble space;
- sidebar owns all controls;
- no control overlays any bubble;
- sidebar remains readable at normal desktop widths;
- buttons use full available sidebar width where useful;
- title selector remains usable with long titles;
- PDF selector and export controls remain functional;
- logout remains visually separate;
- no regression in graph resizing;
- no regression in bubble editing;
- no regression in save behavior.

Do not solve this by merely adding top padding.

Do not solve this by pushing the bubbles downward while leaving controls overlayed.

The toolbar must be structurally outside the graph region.

## Responsive behavior

Desktop:

```text
graph on left
controls vertically on right
```

Narrow screens:

Use a responsive breakpoint.

Acceptable behavior:

```text
controls become a compact block above the graph
```

or:

```text
controls become a collapsible drawer
```

For MVP 1.2, prefer the simpler stacked layout:

```css
@media (max-width: 900px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .workspace-sidebar {
    position: static;
    height: auto;
    order: -1;
  }
}
```

Even on mobile, the controls must remain outside the bubble rendering area.

---

# 2. Fix standalone HTML for real

The current standalone HTML still does not work when opened directly.

Inspection of relative asset paths is not sufficient.

The output must actually work under:

```text
file:///C:/Users/meche/dev/triangle/dist/index.html
```

or another explicitly generated standalone file.

## Important constraint

A normal Vite production build with module chunks may still fail under `file://` because browsers can reject module loading, dynamic imports, or cross-file module access from local files.

Therefore, stop assuming that:

```text
base: "./"
```

is enough.

Implement a standalone artifact that is deliberately compatible with direct file opening.

## Preferred solution

Generate a single-file standalone demo artifact.

Recommended output:

```text
dist/triangle-standalone.html
```

It should contain:

- all required JavaScript bundled inline;
- all required CSS inline;
- no external module chunks;
- no `/src/main.js`;
- no `/assets/...` dependency;
- no Supabase initialization;
- no remote API dependency;
- no authentication requirement;
- local browser persistence;
- the real Triangle renderer and editor code.

The standalone file must reuse the real application modules through the build process.

Do not manually copy and maintain a second Triangle implementation.

Use an appropriate Vite/Rollup single-file build strategy or plugin if compatible with the repository.

Possible directions:

- a dedicated standalone Vite entry;
- inline dynamic imports;
- Rollup output configured to avoid code splitting;
- a single-file bundling plugin;
- a small build script that inlines the generated JS and CSS safely.

Choose the smallest robust solution.

## Standalone entry point

Create a dedicated entry such as:

```text
src/standalone-main.js
```

or:

```text
src/demo/standalone-main.js
```

This entry must:

1. avoid importing authenticated startup code;
2. avoid importing Supabase;
3. create the local demo repository;
4. create or load a Triangle document;
5. mount the same Triangle adapter and editor;
6. show a visible “Mode local” or “Standalone” indicator;
7. render a visible startup error instead of a blank page.

Preferred conceptual split:

```text
Authenticated entry
  → Supabase
  → AuthShell
  → RemoteGraphRepository
  → GraphWorkspace
  → Triangle adapter

Standalone entry
  → LocalDemoGraphRepository
  → GraphWorkspace
  → Triangle adapter
```

The Triangle renderer and adapter must be shared.

## Local standalone persistence

Use localStorage.

Suggested keys:

```text
triangle-standalone-index-v1
triangle-standalone-document-v1:<graph-id>
triangle-standalone-active-v1
```

At minimum:

- load or create one Triangle;
- save edits;
- preserve edits after refresh;
- no network dependency.

Multi-document standalone behavior is welcome if it falls out naturally from the generic workspace, but it is not required to fix this regression.

## Root `index.html`

Do not let the repository root `index.html` silently fail when double-clicked.

When opened through `file://`, it should either:

1. redirect safely to `dist/triangle-standalone.html`; or
2. show a clear instruction page telling the user to open the generated standalone artifact.

Do not load the regular Vite module entry before handling the `file://` case.

A valid simple direction:

```html
<script>
  if (window.location.protocol === "file:") {
    window.location.replace(
      new URL("./dist/triangle-standalone.html", window.location.href).href
    );
  }
</script>
```

This must execute before the normal module script.

Only keep the redirect if manually verified in Chrome.

Otherwise show a clear visible message instead of a blank screen.

---

# 3. Preserve hosted mode

The hosted authenticated application currently works.

Do not regress:

- login;
- account creation;
- graph migration;
- graph selector;
- graph creation;
- rename;
- save;
- graph switching;
- PDF export;
- Markdown export;
- JSON export;
- plain-text export;
- logout.

Hosted mode should continue to run through the existing documented command.

Standalone changes must not make hosted mode import or execute demo-only code unnecessarily.

---

# 4. Error boundaries

Standalone startup must never fail as a blank page.

Wrap standalone startup and render a visible message such as:

```text
Triangle standalone could not be opened.
Open the browser console for details.
```

Log the original exception and stack.

Do not log tokens or user-sensitive graph content.

Hosted startup should retain the improved protected-client error diagnostics already added.

---

# 5. Tests

Add focused regression tests.

## Layout tests

Test or assert, at an appropriate level:

- authenticated controls mount in a sidebar container;
- sidebar and graph region are siblings;
- graph container does not contain the toolbar;
- desktop layout uses two columns;
- responsive layout stacks controls outside the graph;
- repeated mount/unmount does not duplicate sidebar controls;
- export control and selector do not overwrite each other;
- graph still receives available viewport space.

Where exact CSS rendering is difficult to automate, add DOM structure tests and perform the visual check manually.

## Standalone tests

Add tests for:

- standalone entry does not import or initialize Supabase;
- standalone entry does not call `/api/graphs`;
- standalone local repository creates or loads a Triangle;
- Triangle adapter resolves;
- Triangle editor mounts;
- local save works;
- visible error is rendered on startup failure;
- standalone build produces the expected file;
- standalone HTML contains no `/src/main.js`;
- standalone HTML contains no external `/assets/` dependency;
- standalone HTML has no root-absolute asset paths;
- standalone artifact is self-contained or otherwise intentionally file-compatible.

## Existing regression suite

All existing tests must still pass.

---

# 6. Manual verification

Perform these checks after implementation.

## Hosted mode

Run:

```text
pnpm.cmd test
pnpm.cmd build
pnpm.cmd start
```

Open the hosted app and log in.

Confirm:

1. Triangle renders.
2. Controls are vertically arranged on the right.
3. No control overlaps any bubble.
4. Graph uses the full remaining width.
5. Selector works.
6. New works.
7. Rename works.
8. Save works.
9. Switching works.
10. Exports work.
11. Logout works.
12. At narrow width, controls move outside and above the graph rather than overlaying it.

## Standalone mode

Open in ordinary desktop Chrome:

```text
file:///C:/Users/meche/dev/triangle/dist/triangle-standalone.html
```

Confirm:

1. Page is not blank.
2. Triangle renders.
3. All expected bubbles render.
4. Standalone/local indicator appears.
5. Editing works.
6. Refresh preserves edits.
7. No Supabase request.
8. No `/api/graphs` request.
9. No fatal console error.
10. No missing asset error.

Also open:

```text
file:///C:/Users/meche/dev/triangle/index.html
```

Confirm it either:

- redirects successfully to the standalone artifact; or
- shows a clear instruction.

It must not be blank.

Do not claim standalone support until this exact manual Chrome test succeeds.

---

# 7. Validation commands

Run:

```text
pnpm.cmd test
pnpm.cmd build
git diff --check
git status
git diff --stat
```

Do not commit.

---

# 8. Final report

Report:

1. exact reason the previous standalone build failed under `file://`;
2. exact standalone build strategy used;
3. exact file users should open;
4. whether root `index.html` redirects or displays instructions;
5. proof that the standalone artifact has no external module/asset dependency;
6. exact layout structure used for graph and sidebar;
7. responsive behavior;
8. files changed;
9. tests added;
10. automated test results;
11. exact manual Chrome verification;
12. remaining limitations.

Do not commit.
