import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  // Set to the real domain before launch — used for canonical URLs + sitemap.
  site: "https://poptop.uk",
  output: "server",
  adapter: cloudflare({
    // Exposes the D1 binding (from wrangler.jsonc) to `astro dev` via wrangler's
    // local state — the same local DB the seed script populated.
    platformProxy: { enabled: true },
  }),
});
