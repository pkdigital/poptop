// Better Auth on Cloudflare D1.
//
// The D1 binding only exists per-request inside the Worker (Astro.locals.runtime.env),
// so we build the auth instance lazily via getAuth(env) in the catch-all route and
// middleware rather than at module load. `kysely-d1`'s D1Dialect lets Better Auth's
// Kysely adapter speak to D1 directly (no Drizzle/ORM needed — matches our raw-SQL stack).
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { D1Dialect } from "kysely-d1";

export type AuthEnv = {
  DB: D1Database;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  FACEBOOK_CLIENT_ID?: string;
  FACEBOOK_CLIENT_SECRET?: string;
};

export function getAuth(env: AuthEnv) {
  // Only wire a provider when both halves of its credential pair are present, so the
  // app boots fine before you've registered every OAuth app (e.g. Apple takes longest).
  const socialProviders: NonNullable<BetterAuthOptions["socialProviders"]> = {};
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }
  if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) {
    socialProviders.apple = {
      clientId: env.APPLE_CLIENT_ID,
      clientSecret: env.APPLE_CLIENT_SECRET,
    };
  }
  if (env.FACEBOOK_CLIENT_ID && env.FACEBOOK_CLIENT_SECRET) {
    socialProviders.facebook = {
      clientId: env.FACEBOOK_CLIENT_ID,
      clientSecret: env.FACEBOOK_CLIENT_SECRET,
    };
  }

  return betterAuth({
    database: { dialect: new D1Dialect({ database: env.DB }), type: "sqlite" },
    secret: env.BETTER_AUTH_SECRET,
    // baseURL is needed to build OAuth callback URLs; in dev Better Auth infers it
    // from the request, in prod set BETTER_AUTH_URL=https://poptop.uk.
    baseURL: env.BETTER_AUTH_URL,
    socialProviders,
    // Sign cookies hold a short-lived session copy → avoids a D1 read on every
    // request (most of our traffic is anonymous SEO pages, so keep auth cheap).
    session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
  });
}

export type Auth = ReturnType<typeof getAuth>;

// Static instance for the Better Auth CLI (`@better-auth/cli generate`) ONLY.
// Schema generation introspects options and never opens the binding, so a
// placeholder env is safe here. Do not import this at runtime — use getAuth(env).
export const auth = getAuth({ DB: undefined as unknown as D1Database });
