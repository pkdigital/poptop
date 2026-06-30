/// <reference path="../.astro/types.d.ts" />

declare module "@fontsource-variable/*";

// Cloudflare bindings available via Astro.locals.runtime.env.
type Env = {
  DB: any; // D1Database
  W3W_API_KEY?: string;
  MAPILLARY_TOKEN?: string;
  ANTHROPIC_API_KEY?: string;
  ADMIN_TOKEN?: string;
  AI?: any; // Workers AI binding (for moderation, later)
  // Better Auth (src/lib/auth.ts) — set as wrangler secrets in prod.
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  FACEBOOK_CLIENT_ID?: string;
  FACEBOOK_CLIENT_SECRET?: string;
};

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {
    user: import("better-auth").User | null;
    session: import("better-auth").Session | null;
  }
}
