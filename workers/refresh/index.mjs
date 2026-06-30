// Ingest worker: monthly OSM refresh only. Kept separate from the Astro app
// (which serves all request traffic) so ingest and serving scale independently.
// Both bind the same poptop-db D1.

import { refreshOsm } from "../../src/lib/refresh.mjs";

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      refreshOsm(env.DB).then((n) => console.log(`Refreshed ${n} OSM places`))
    );
  },

  // Manual trigger for testing: POST /refresh
  async fetch(request, env) {
    if (request.method === "POST" && new URL(request.url).pathname === "/refresh") {
      const n = await refreshOsm(env.DB);
      return Response.json({ refreshed: n });
    }
    return new Response("poptop-refresh worker", { status: 200 });
  },
};
