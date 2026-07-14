# Triangle Auth Shell

Triangle is a static client app mounted behind a reusable Supabase email/password auth shell.

## Setup

1. Create a Supabase project.
2. In Supabase, copy the project URL and public anonymous key.
3. For MVP 0 immediate access after signup, disable mandatory email confirmation in Supabase Auth settings.
4. Copy `.env.example` to `.env`.
5. Fill in:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Only the public anonymous key belongs in this frontend. Do not use a service-role key.

## Local Development

Install dependencies:

```sh
pnpm install
```

Run locally:

```sh
pnpm dev
```

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

