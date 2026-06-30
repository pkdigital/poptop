// Ingest worker: monthly OSM refresh + frequent og:image/description top-up.
// Both bind the same poptop-db D1.

import { refreshOsm } from "../../src/lib/refresh.mjs";
import { resolveOgBatch } from "../../src/lib/ogimage.mjs";

const MONTHLY_OSM = "0 4 1 * *";

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === MONTHLY_OSM) {
      ctx.waitUntil(
        refreshOsm(env.DB).then((n) => console.log(`Refreshed ${n} OSM places`))
      );
    } else {
      // Hourly: chew through un-resolved website og:images/descriptions.
      ctx.waitUntil(
        resolveOgBatch(env.DB, 20).then((r) =>
          console.log(`og batch: ${r.withImage}/${r.processed} with image`)
        )
      );
    }
  },

  // Manual triggers for testing: POST /refresh or POST /og
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === "POST" && pathname === "/refresh") {
      return Response.json({ refreshed: await refreshOsm(env.DB) });
    }
    if (request.method === "POST" && pathname === "/og") {
      return Response.json(await resolveOgBatch(env.DB, 20));
    }
    return new Response("poptop-refresh worker", { status: 200 });
  },
};
