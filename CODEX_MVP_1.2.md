# CODEX.md — Graph Workspace MVP 1.2

Read the entire repository before modifying code.

Understand the current architecture, especially:

- authentication and protected-client boundaries;
- `GraphController`;
- canonical graph state;
- remote and local repositories;
- `/api/graph`;
- file persistence;
- export ownership;
- Triangle rendering;
- Vite build and `index.html` behavior.

Produce a concise implementation plan first.

Then implement the plan unless a blocking architectural problem is discovered.

Do not commit.

---

# Objective

Implement MVP 1.2 as a reusable authenticated graph-document workspace.

The system must evolve from:

```text
one authenticated user
        ↓
one graph
```

to:

```text
one authenticated user
        ↓
multiple graph documents
        ↓
Triangle is the first graph type
```

The architecture must remain reusable for future visualizations such as:

- another Triangle variant;
- BubbleCal;
- timelines;
- bubble maps;
- other interactive graphs.

Do not create a Triangle-specific persistence platform.

Build a generic graph-document layer, with Triangle-specific rendering and semantics injected at the client boundary.

---

# Existing MVP 1.1 capabilities

Preserve all currently working behavior:

- Supabase authentication;
- protected-client architecture;
- one persisted graph per authenticated user;
- local draft fallback;
- adaptive Triangle rendering;
- PDF export;
- Markdown export;
- JSON export;
- plain-text clipboard export;
- export ownership inside the Triangle client;
- generic authenticated action slot;
- canonical state through `GraphController.getState()`;
- direct Node hosting with file persistence.

All 34 existing tests must continue to pass unless intentionally replaced by equivalent coverage.

---

# Core architectural direction

The target separation is:

```text
Authentication shell
        ↓
Generic graph workspace
        ↓
Graph document persistence
        ↓
Graph-type adapter
        ↓
Triangle editor and renderer
```

The generic workspace should own:

- document listing;
- document creation;
- document selection;
- rename;
- remote persistence;
- local draft recovery;
- active-document lifecycle;
- generic JSON export;
- filename sanitization;
- download helpers;
- clipboard helpers;
- generic toolbar placement.

Triangle should own:

- Triangle default state;
- Triangle state validation;
- Triangle rendering;
- Triangle editing;
- Triangle Markdown conversion;
- Triangle plain-text conversion;
- Triangle PDF rendering/capture;
- Triangle-specific labels and semantics.

Do not make authentication aware of graph internals.

Do not make the generic persistence layer aware of Triangle bubbles, sectors, or labels.

---

# Graph document model

Introduce a generic graph document.

Recommended shape:

```json
{
  "schemaVersion": 1,
  "id": "stable-uuid",
  "type": "triangle-needs-map",
  "title": "Triangle du 18 juillet 2026",
  "createdAt": "2026-07-18T12:00:00.000Z",
  "updatedAt": "2026-07-18T12:00:00.000Z",
  "state": {
    "schemaVersion": 1,
    "graphId": "triangle",
    "updatedAt": "2026-07-18T12:00:00.000Z",
    "content": {
      "bubbles": {}
    }
  }
}
```

Requirements:

- stable UUID document ID;
- graph `type`;
- editable human-readable `title`;
- creation timestamp;
- update timestamp;
- canonical graph state;
- schema versioning;
- identity independent from title;
- state validated through the registered graph-type adapter;
- metadata validated generically.

Do not derive graph identity from title or mutable graph content.

Use a graph-type identifier such as:

```text
triangle-needs-map
```

Do not use a generic value such as `triangle` if it would prevent future Triangle variants from coexisting cleanly.

---

# Graph-type adapter

Create the smallest useful graph-type contract proven by Triangle.

A possible direction:

```js
{
  type,
  displayName,
  createDefaultState,
  validateState,
  mountEditor,
  buildMarkdown,
  buildPlainText,
  exportPdf
}
```

Adjust this contract to fit the existing repository architecture.

The adapter must allow another graph type to reuse:

- authentication;
- multi-document persistence;
- local drafts;
- selection;
- creation;
- rename;
- generic JSON export;
- generic file-download helpers.

Avoid building a large plugin framework.

Do not add:

- dependency injection containers;
- dynamic plugin discovery;
- universal layout engines;
- arbitrary schema registries;
- runtime-loaded third-party plugins.

Build only the extension points needed by the current Triangle implementation and one plausible second graph type.

---

# Generic API

Evolve the server toward a generic graph-document API.

Add:

```text
GET    /api/graphs
POST   /api/graphs
GET    /api/graphs/:id
PUT    /api/graphs/:id
PATCH  /api/graphs/:id
```

Required behavior:

## `GET /api/graphs`

Return summaries of the authenticated user’s graph documents.

Support optional type filtering only if it can be added cleanly, for example:

```text
GET /api/graphs?type=triangle-needs-map
```

Type filtering is not required if it materially expands scope.

## `POST /api/graphs`

Create a new graph document.

The client supplies the requested registered graph type and optionally a title.

The server must:

- generate or validate the stable document ID;
- assign timestamps;
- persist the canonical initial state;
- return the complete created document.

Prefer server-generated UUIDs unless the current architecture strongly favors client-generated UUIDs.

## `GET /api/graphs/:id`

Return one complete graph document belonging to the authenticated user.

## `PUT /api/graphs/:id`

Persist the complete canonical state for that document.

Do not permit changing document identity through `PUT`.

## `PATCH /api/graphs/:id`

Support minimal metadata changes, initially rename only.

Do not implement deletion in MVP 1.2.

---

# `/api/graph` compatibility

Do not remove the existing singular endpoint during MVP 1.2.

Keep:

```text
GET /api/graph
PUT /api/graph
```

as a compatibility path.

However, do not maintain a separate source of truth.

After migration, the compatibility endpoint should delegate to the user’s migrated initial graph document or another clearly defined default graph.

Document the exact compatibility behavior.

Requirements:

- existing deployed clients must not immediately break;
- legacy graph data must remain readable;
- `/api/graph` and `/api/graphs/:id` must not diverge;
- compatibility access must not create duplicate graph documents;
- migration must remain idempotent;
- removal of `/api/graph` belongs to a later cleanup release.

---

# File storage layout

Use generic graph naming.

Recommended durable layout:

```text
data/users/<user-id>/
├── graph.json
├── graphs-index.json
└── graphs/
    ├── <graph-id>.json
    └── <graph-id>.json
```

Where:

- `graph.json` is the legacy MVP 1.1 file and must be preserved;
- `graphs-index.json` stores graph summaries and migration metadata;
- each graph document is stored independently under `graphs/`.

Keep files human-readable.

A possible index shape:

```json
{
  "schemaVersion": 1,
  "migration": {
    "legacyGraphMigrated": true,
    "legacyGraphId": "stable-uuid"
  },
  "graphs": [
    {
      "id": "stable-uuid",
      "type": "triangle-needs-map",
      "title": "Triangle initial",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

Do not store the active graph ID in the server index for MVP 1.2.

Active selection is initially a browser preference, not canonical server data.

---

# Persistence requirements

Preserve or implement:

- verified Supabase user identity;
- strict per-user isolation;
- safe UUID validation;
- rejection of path traversal attempts;
- body size limits;
- file size limits;
- malformed JSON handling;
- corrupt file handling;
- atomic writes;
- temporary-file cleanup;
- safe concurrent save behavior;
- deterministic list ordering;
- recovery from partially completed migration;
- no database.

Do not trust IDs, types, timestamps, or titles supplied by the client without validation.

Use an allowlist for graph types supported by the deployed application.

---

# Legacy migration

Existing users may have:

```text
data/users/<user-id>/graph.json
```

MVP 1.2 must preserve and migrate this data safely.

Migration should happen lazily on the first authenticated graph API request.

Expected behavior:

1. Load or initialize `graphs-index.json`.
2. Detect an unmigrated legacy `graph.json`.
3. Normalize and validate the legacy graph state.
4. Create exactly one generic graph document:
   - stable deterministic ID;
   - type `triangle-needs-map`;
   - title `Triangle initial` or a date-based equivalent;
   - preserved legacy canonical state.
5. Atomically write the migrated graph document.
6. Atomically write/update `graphs-index.json`.
7. Leave `graph.json` untouched for rollback and debugging.

Migration must be:

- idempotent;
- deterministic;
- safe after interruption;
- incapable of producing duplicate initial graphs;
- recoverable if the graph file exists but the index write failed;
- recoverable if the index exists but needs verification or repair.

The deterministic legacy graph ID should derive only from:

- the verified user UUID;
- a fixed namespace or migration constant.

Do not derive it from mutable graph contents.

Test interrupted migration explicitly.

---

# Generic graph repository

Introduce generic repository interfaces where useful.

The generic remote repository should support approximately:

```text
listGraphs()
createGraph(type, title?)
loadGraph(id)
saveGraph(document or state)
renameGraph(id, title)
```

Keep the existing `GraphController` focused on one active canonical graph state.

Do not turn `GraphController` into a multi-document manager.

Introduce a small workspace/coordinator layer responsible for:

- graph summaries;
- active graph ID;
- loading;
- creating;
- switching;
- renaming;
- controller lifecycle;
- graph-type adapter selection;
- local draft repository selection.

---

# Active graph lifecycle

Use one ordinary `GraphController` for the currently active graph.

On graph switch:

```text
flush or preserve current graph
        ↓
invalidate current controller callbacks
        ↓
unmount current editor
        ↓
load selected graph
        ↓
resolve pending local draft
        ↓
create new GraphController
        ↓
mount selected graph editor
```

Requirements:

- a stale save from graph A must never overwrite graph B;
- switching repeatedly must not leak listeners or observers;
- unresolved graph A changes must remain in graph A’s local draft;
- controller callbacks must be invalidated or generation-scoped;
- failed switch/load should not destroy the currently visible graph;
- creation should preserve the current graph before opening the new one.

Use bounded waits for flushes.

Do not block indefinitely on network calls.

---

# Local drafts

Replace the one-user/one-graph draft key with graph-scoped keys.

Use a shape such as:

```text
graph-draft-v2:<user-id>:<graph-id>
graph-index-cache-v1:<user-id>
graph-active-v1:<user-id>
```

Draft requirements:

- isolated by authenticated user;
- isolated by graph document;
- pending/dirty state recorded explicitly;
- updated timestamp recorded;
- failed save for graph A cannot overwrite graph B;
- logout preserves unresolved drafts;
- switching preserves unresolved drafts;
- remote state remains authoritative when no pending local draft exists;
- explicitly pending local draft may recover after failed or timed-out remote save.

Plan and implement migration or cleanup of the current MVP 1.1 draft key where appropriate.

Do not silently discard the existing draft if it contains unresolved work.

---

# Active graph preference

Store the active graph selection locally:

```text
graph-active-v1:<user-id>
```

Startup behavior:

1. list the user’s graphs;
2. restore the locally selected graph if it still exists;
3. otherwise select the most recently updated graph of the Triangle type;
4. otherwise use the migrated initial graph;
5. otherwise create a new Triangle graph.

Do not store active selection in `graphs-index.json` during MVP 1.2.

This avoids:

- cross-device contention;
- multi-tab active-selection fights;
- treating a UI preference as durable domain state.

---

# Minimal UI

Keep the graph as the primary screen.

Add a compact graph workspace control in the existing authenticated action area.

Preferred direction:

```text
[ Triangle actuel ▾ ] [ Nouveau ] [ Renommer ] [ PDF ▾ ] [ Exporter ] [ Déconnexion ]
```

The exact responsive arrangement may vary.

Requirements:

- current graph title is visible;
- user can open another graph;
- user can create a new Triangle graph;
- user can rename the active graph;
- export controls still work;
- logout remains available;
- mobile layout remains usable;
- no large dashboard;
- no sidebar unless clearly necessary;
- no destructive reset behavior.

The graph selector should display only graph documents supported by the active client or filter by the current Triangle type.

Do not expose unsupported graph types in a way that the Triangle client cannot render.

---

# New graph behavior

“New graph” in the Triangle client means:

```text
create another Triangle graph document
```

It must not mean:

```text
erase or reset the current graph
```

Flow:

1. safely flush or preserve the current graph;
2. request creation of a new graph document with type `triangle-needs-map`;
3. use the Triangle adapter’s default canonical state;
4. assign a default title;
5. open it immediately;
6. remember it as the local active graph;
7. allow rename.

Suggested default title:

```text
Triangle du 18 juillet 2026
```

If another graph already has that title, append a deterministic or human-readable suffix.

Do not rely on title uniqueness for identity.

---

# Rename behavior

Rename must:

- change only the title;
- preserve stable graph ID;
- preserve graph type;
- preserve graph state;
- update `updatedAt` if this matches the project’s metadata semantics;
- refresh selector metadata;
- update future export filenames.

Use a small modal or inline input consistent with the existing UI.

Avoid `window.prompt()` unless implementing an in-app rename surface would materially expand scope.

Validate:

- non-empty normalized title;
- reasonable maximum length;
- safe Unicode handling;
- filename sanitization separately from stored title.

---

# Export behavior

Exports apply only to the active graph document.

## PDF

Remain graph-type specific.

Triangle owns its PDF capture/render behavior.

Filename should use the sanitized graph title:

```text
triangle-de-lea-juillet-2026.pdf
```

Fallback:

```text
triangle-YYYY-MM-DD.pdf
```

## Markdown

Remain graph-type specific.

Triangle converts its active graph state to meaningful human-readable hierarchy.

## Plain text

Remain graph-type specific.

Triangle converts its active graph state to readable text, then the generic clipboard helper copies it.

## JSON

JSON export is generic.

Export the complete active graph document:

```json
{
  "schemaVersion": 1,
  "id": "...",
  "type": "triangle-needs-map",
  "title": "...",
  "createdAt": "...",
  "updatedAt": "...",
  "state": {
    "schemaVersion": 1,
    "graphId": "triangle",
    "updatedAt": "...",
    "content": {}
  }
}
```

This prepares for a later import feature without implementing import now.

Do not serialize the DOM.

---

# Direct `index.html` / demo behavior

There is a regression:

Opening the repository’s `index.html` directly now produces a blank page, whereas the original project displayed the bubbles.

Confirmed likely constraints include:

- root-absolute `/src/main.js`;
- root-absolute built asset paths;
- Vite bare module imports;
- CSS imports;
- `import.meta.env`;
- Supabase initialization;
- remote API assumptions;
- browser restrictions for ES modules loaded through `file://`.

Implement the smallest honest solution.

First investigate whether a built demo can run directly from:

```text
file:///.../dist/index.html
```

A relative Vite base such as:

```js
base: "./"
```

may be necessary but is not sufficient proof.

The direct/demo success criteria are:

- Triangle renders;
- bubbles render;
- editing works locally;
- Supabase is not required;
- remote API is not required;
- page is not blank;
- user sees a clear local/demo-mode indicator;
- hosted authenticated mode remains unchanged.

Add a runtime demo branch that can mount Triangle with:

- local state;
- no Supabase client;
- no `/api/graphs`;
- no authenticated persistence.

Explicitly test the built artifact manually in Chrome through `file://`.

If browser CORS/module restrictions still prevent direct file opening:

- do not add fragile hacks;
- do not manually duplicate the whole application into a second HTML file;
- do not claim support without verification.

Instead choose the cleanest fallback:

1. generated standalone demo HTML produced by a build command; or
2. a graceful page plus a trivial local launcher script/command.

Prefer a generated standalone artifact if it can reuse the application source without hand-maintained duplication.

Document exactly what works.

---

# Generic demo mode

Demo mode should use the same Triangle adapter and renderer as hosted mode.

Do not maintain a second hand-written Triangle implementation.

Preferred architecture:

```text
Hosted mode
    auth
    remote graph repository
    graph workspace
    Triangle adapter

Demo mode
    local anonymous repository
    graph workspace or simple single-document host
    Triangle adapter
```

Full multi-document demo mode is optional.

At minimum, demo mode should restore the original quality:

```text
open graph
→ see bubbles
→ edit locally
```

---

# Backward compatibility

MVP 1.2 must preserve:

- Supabase login;
- account creation;
- logout;
- adaptive bubbles;
- central Triangle geometry;
- current exports;
- existing persisted `graph.json`;
- existing local draft recovery;
- mobile behavior;
- generic auth shell;
- protected-client abstraction;
- one-file-per-document persistence;
- current hosting behavior.

Do not require existing users to manually recreate graphs.

---

# Non-goals

Do not implement:

- database storage;
- deletion;
- duplication;
- import;
- version history;
- comparison between graphs;
- collaborative editing;
- graph sharing;
- folders;
- tags;
- search;
- organization accounts;
- administrator UI;
- dynamic plugin installation;
- arbitrary graph schemas;
- universal rendering framework.

Deletion, duplication, import, history, and comparison may be noted as future work only.

---

# Implementation phases

Implement in two internal phases.

Continue through both unless a blocking architectural issue appears.

## Phase A — Generic domain, storage, migration, API

Implement:

- generic graph document model;
- generic graph index model;
- graph type allowlist;
- generic `FileGraphStore`;
- lazy legacy migration;
- `/api/graphs`;
- `/api/graph` compatibility delegation;
- validation;
- atomic persistence;
- corruption handling;
- tests.

Run tests before proceeding.

## Phase B — Client graph workspace and Triangle integration

Implement:

- generic graph workspace/coordinator;
- remote graph repository;
- graph-scoped local drafts;
- local active graph preference;
- selector;
- new graph;
- rename;
- safe switching;
- Triangle adapter;
- active-document exports;
- demo/direct behavior;
- responsive UI;
- tests.

---

# Required tests

Add tests for at least:

## Generic domain and storage

- graph document validation;
- graph type validation;
- invalid UUID rejection;
- path traversal rejection;
- title validation;
- two graphs for one user remain independent;
- two users remain isolated;
- list summaries match persisted documents;
- corrupt graph file handling;
- corrupt index handling;
- index repair or safe failure behavior;
- atomic write behavior where testable.

## Migration

- legacy `graph.json` migrates exactly once;
- migration creates a generic graph document of type `triangle-needs-map`;
- legacy file remains untouched;
- repeated initialization creates no duplicate;
- interruption after graph write recovers;
- interruption before index write recovers;
- `/api/graph` resolves to the migrated graph;
- `/api/graph` and `/api/graphs/:id` do not diverge.

## Workspace lifecycle

- creating a new graph preserves the current graph;
- switching loads the correct graph;
- stale save callbacks cannot write into the newly active graph;
- rename preserves graph identity;
- active local preference restores correctly;
- missing active preference falls back correctly;
- repeated switching does not leak graph ownership;
- failed switch does not destroy current graph;
- logout/login restores graphs.

## Drafts

- drafts are isolated by user;
- drafts are isolated by graph;
- failed save preserves pending draft;
- pending draft recovery works;
- draft for graph A never applies to graph B;
- migration from the current draft key is safe where implemented.

## Export

- JSON exports the complete generic graph document;
- PDF uses active graph title;
- Markdown uses active graph title and state;
- plain text uses active graph state;
- filenames are sanitized;
- fallback filenames work.

## Demo/direct mode

- demo mode mounts without Supabase;
- demo mode does not call remote API;
- Triangle renders in demo mode;
- local edits work in demo mode;
- hosted mode remains authenticated;
- built direct artifact behavior is tested as far as automation permits.

---

# Manual validation

After implementation, manually verify:

1. Log in with an existing MVP 1.1 user.
2. Confirm the legacy graph appears as the initial Triangle.
3. Edit it.
4. Create a second Triangle.
5. Edit the second Triangle differently.
6. Switch repeatedly between both.
7. Confirm their content remains independent.
8. Rename one.
9. Refresh.
10. Log out and back in.
11. Confirm the expected Triangle reopens.
12. Simulate a failed remote save.
13. Switch graphs.
14. Confirm unresolved work remains recoverable only in the correct graph.
15. Export PDF, Markdown, JSON, and plain text from each graph.
16. Inspect JSON for complete generic graph-document metadata.
17. Test the toolbar on narrow mobile widths.
18. Confirm `/api/graph` still resolves safely.
19. Build the project.
20. Open the intended demo artifact through `file://` in Chrome.
21. Confirm the exact direct/demo behavior.

---

# Validation commands

Run:

```text
pnpm.cmd test
pnpm.cmd build
git diff --check
```

Also inspect:

```text
git status
git diff --stat
```

Do not commit.

---

# Final report

At the end, provide:

1. implementation summary;
2. final architecture;
3. generic graph-type adapter contract;
4. graph document schema;
5. storage layout;
6. API behavior;
7. exact `/api/graph` compatibility behavior;
8. migration behavior;
9. local draft strategy;
10. active graph strategy;
11. UI behavior;
12. export behavior;
13. direct/demo result;
14. modified and added files;
15. automated test results;
16. manual test procedure;
17. remaining risks and trade-offs.

Be explicit about anything not completed or not proven.

Do not commit.
