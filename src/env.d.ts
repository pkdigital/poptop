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
};

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
