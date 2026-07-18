# Triangle Auth Shell

Triangle is a static client app mounted behind a reusable Supabase email/password auth shell. Authenticated content is stored as human-readable graph document JSON files per Supabase user. The app does not use a database for graph persistence.

## Setup

1. Create a Supabase project.
2. In Supabase, copy the project URL and public anonymous key.
3. For MVP 0 immediate access after signup, disable mandatory email confirmation in Supabase Auth settings.
4. Copy `.env.example` to `.env`.
5. Fill in:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
GRAPH_DATA_DIR=./data/users
```

Only the public anonymous key belongs in this frontend. Do not use a service-role key. The server can read `SUPABASE_URL`/`SUPABASE_ANON_KEY`; it also accepts the `VITE_` names for local convenience.

## Local Development

Install dependencies:

```sh
pnpm install
```

Run the frontend-only Vite dev server:

```sh
pnpm dev
```

Run the complete local app from the production build:

```sh
pnpm build
pnpm start
```

`pnpm start` serves `dist/` and the graph API from one Node process on the same origin. `pnpm server` is an alias for the same server command.

Build for production:

```sh
pnpm build
```

Preview the production build:

```sh
pnpm preview
```

## Architecture

`src/main.js` is the composition point. It creates the Supabase-backed `AuthController`, creates the auth shell, and injects one protected client dependency.

Auth modules live in `src/auth/` and do not import Triangle. Triangle-specific mounting lives in `src/clients/triangle-client.js` and `src/triangle/`.

Graph state lives in `src/graph/`. Triangle display consumes a graph controller but does not know whether persistence is backed by localStorage, files, or a future database. Persistence adapters live in `src/persistence/` and server-side file storage lives in `server/persistence/`.

To replace Triangle with another protected static client, change the protected client import and injected dependency in `src/main.js`:

```js
import { demoClient } from "./clients/demo-client.js";

createAuthShell({
  root,
  authController,
  protectedClient: demoClient
});
```

The protected client contract is documented in `src/clients/protected-client.js`.

## Manual Test Matrix

| Situation | Expected result |
|---|---|
| First visit | Login/signup form |
| New valid account | Immediate protected access when Supabase returns a session |
| Signup with email confirmation enabled | Message asks user to check email |
| Existing account | Login succeeds |
| Wrong password | Generic credentials error |
| Refresh after login | Triangle remains visible while session is valid |
| Logout | Triangle unmounts and login displays |
| Replace client dependency | Demo client opens without auth-module changes |
| Missing env values | Readable configuration error |

## Security Boundary

MVP 0 gates access through the application UI. Static assets are still shipped to the browser, so this should not be treated as a hard content-protection boundary. Future protected data should be fetched only after authentication.

## Graph Persistence

The generic graph document API is:

```http
GET /api/graphs
POST /api/graphs
GET /api/graphs/:id
PUT /api/graphs/:id
PATCH /api/graphs/:id
Authorization: Bearer <supabase-access-token>
```

`POST /api/graphs` accepts a registered graph type, currently `triangle-needs-map`, and an optional title. `PUT /api/graphs/:id` persists the active document state without changing document identity. `PATCH /api/graphs/:id` currently supports rename.

The legacy graph API remains available for MVP 1.2 compatibility:

```http
GET /api/graph
PUT /api/graph
Authorization: Bearer <supabase-access-token>
```

The compatibility endpoint delegates to the migrated initial graph document when a legacy `graph.json` exists. If no legacy file exists, compatibility writes use the same deterministic compatibility document rather than a separate source of truth. `/api/graph` and `/api/graphs/:id` therefore read and write the same stored document state.

The server verifies the Supabase access token before deriving the user file path. It prefers `supabase.auth.getClaims(accessToken)` and uses the verified `sub` claim as the user id. If claims verification is unavailable or incompatible with the project configuration, it falls back to `supabase.auth.getUser(accessToken)`, which verifies the token with Supabase Auth. The server never decodes JWTs without signature verification.

Files are written under:

```text
<GRAPH_DATA_DIR>/<verified-user-id>/
├── graph.json
├── graphs-index.json
└── graphs/
    └── <graph-id>.json
```

`GRAPH_DATA_DIR` defaults to `./data/users`. `graph.json` is the preserved MVP 1.1 legacy file. `graphs-index.json` stores graph summaries and migration metadata. Each graph document is stored independently under `graphs/`. The browser never sends a filesystem path, and client-provided `userId` values are ignored.

Stored graph documents use schema version `1`, stable UUID ids, a graph `type`, editable title metadata, timestamps, and a canonical `state`. Triangle documents use graph type `triangle-needs-map`, and their state remains the existing Triangle graph state: schema version `1`, graph id `triangle`, formatted UTF-8 JSON, and content-only bubble text keyed by stable Triangle `data-id` values. Transient layout measurements are not persisted.

Legacy migration happens lazily on the first authenticated graph API request. The server detects `graph.json`, creates exactly one deterministic `triangle-needs-map` graph document titled `Triangle initial`, writes/repairs `graphs-index.json`, and leaves `graph.json` untouched for rollback and debugging.

Current conservative limits:

```text
GRAPH_BODY_LIMIT_BYTES=98304
GRAPH_FILE_SIZE_LIMIT_BYTES=131072
MAX_BUBBLE_TEXT_LENGTH=2000
```

`data/users/` is ignored by git; keep real user files out of commits.

## Local Drafts and Active Graph

The browser stores graph-scoped drafts under:

```text
graph-draft-v2:<user-id>:<graph-id>
graph-index-cache-v1:<user-id>
graph-active-v1:<user-id>
```

Remote state is authoritative unless a pending local draft is at least as new as the remote state. Active graph selection is a local browser preference, not server state.

## Direct Demo Mode

Hosted mode remains authenticated. Demo mode is selected when the built app is opened with `?demo=1` or through `file://`.

Run:

```sh
pnpm build
```

Then open:

```text
dist/index.html
```

The root `index.html` redirects `file://` opens to `dist/index.html?demo=1` when the build output exists. Demo mode uses the same Triangle renderer and graph workspace with browser-local graph documents; Supabase and `/api/graphs` are not required. Because raw source modules still depend on Vite resolution, `dist/index.html` is the supported direct-open artifact.

## Hosting Note

This MVP requires a durable writable filesystem for `GRAPH_DATA_DIR`. Hosts with ephemeral filesystems, read-only deployments, or per-instance local disks can lose data or split one user's graph across instances unless that directory is mounted on persistent shared storage.

