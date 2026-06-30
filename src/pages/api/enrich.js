import { enrichBatch } from "../../lib/enrich.mjs";

export const prerender = false;

// POST /api/enrich?limit=10 — AI title/description for a batch of stopover/site
// places. Call repeatedly until remaining = 0. ADMIN_TOKEN-guarded when set.
export async function POST({ url, request, locals }) {
  const env = locals.runtime.env;
  if (env.ADMIN_TOKEN && request.headers.get("x-poptop-admin") !== env.ADMIN_TOKEN) {
    return new Response("forbidden", { status: 403 });
  }

  const limit = Math.min(Number(new URL(url).searchParams.get("limit")) || 10, 25);
  const result = await enrichBatch(env, limit);

  const rem = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM osm_places o LEFT JOIN place_geo g ON g.place_ref = 'osm/' || o.osm_id` +
      ` WHERE o.category IN ('caravan_site','camp_site','motorhome_parking') AND g.ai_checked IS NULL`
  ).first();

  return Response.json({ ...result, remaining: rem.n });
}
