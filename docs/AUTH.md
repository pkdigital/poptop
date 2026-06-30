# Auth (Better Auth on D1)

Social login via [Better Auth](https://better-auth.com) backed by the same Cloudflare
D1 database as the rest of the app (Kysely + `kysely-d1` dialect — no ORM).

## How it's wired

- **[src/lib/auth.ts](../src/lib/auth.ts)** — `getAuth(env)` builds the auth instance
  per request, because the D1 binding only exists at runtime (`Astro.locals.runtime.env`).
  Providers self-enable only when both their `*_CLIENT_ID` and `*_CLIENT_SECRET` are set.
- **[src/pages/api/auth/[...all].ts](../src/pages/api/auth/[...all].ts)** — handles every
  `/api/auth/*` request (sign-in, OAuth callbacks, session, sign-out).
- **[src/middleware.ts](../src/middleware.ts)** — sets `Astro.locals.user` / `.session`
  on each request. Anonymous traffic short-circuits (cookie cache, no D1 read).
- **[src/lib/auth-client.ts](../src/lib/auth-client.ts)** — browser client.
- Tables (`user`, `session`, `account`, `verification`) — migration
  [0007_better_auth.sql](../migrations/0007_better_auth.sql). Kept separate from
  `osm_places` (ODbL) and `community_listings`.

## Using it

Server (in any `.astro` page): `const user = Astro.locals.user;`

Client (sign-in button):

```ts
import { signIn, signOut } from "../lib/auth-client";
signIn.social({ provider: "google", callbackURL: "/explore" });
signOut();
```

## Enabling a provider

1. Register an OAuth app and set the **redirect/callback URL** to:
   - Google:  `https://poptop.uk/api/auth/callback/google`
   - Facebook: `https://poptop.uk/api/auth/callback/facebook`
   - Apple:   `https://poptop.uk/api/auth/callback/apple`
   - (dev: swap origin for `http://localhost:4321`)
2. Put the credentials in `.dev.vars` for local, and as Worker secrets for prod.

Notes: Google → Cloud Console OAuth client (also add the localhost redirect for dev).
Facebook → Meta app, "Facebook Login" product, requires HTTPS + privacy-policy URL to
go live. Apple → Apple Developer "Sign in with Apple"; the client secret is a JWT you
generate from a key and must rotate (≤6 months) — wire this last, it's the most involved.

## Production secrets

```bash
npx wrangler secret put BETTER_AUTH_SECRET        # openssl rand -base64 32 (NOT the dev one)
npx wrangler secret put BETTER_AUTH_URL           # https://poptop.uk
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
# ...repeat per provider you enable
```

The auth migration is already applied to local and prod D1.
