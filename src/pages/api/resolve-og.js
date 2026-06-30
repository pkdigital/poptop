import { resolveOgBatch } from "../../lib/ogimage.mjs";

export const prerender = false;

// POST /api/resolve-og?limit=15 — resolves website og:image/description for a
// batch of not-yet-checked places. Call repeatedly (or from cron) until
// remaining = 0. Guarded by ADMIN_TOKEN when set (open in local dev).
export async function POST({ url, request, locals }) {
  const env = locals.runtime.env;
  if (env.ADMIN_TOKEN && request.headers.get("x-poptop-admin") !== env.ADMIN_TOKEN) {
    return new Response("forbidden", { status: 403 });
  }

  const limit = Math.min(Number(new URL(url).searchParams.get("limit")) || 15, 20);
  const { processed, withImage } = await resolveOgBatch(env.DB, limit);

  const rem = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM osm_places o LEFT JOIN place_geo g ON g.place_ref = 'osm/' || o.osm_id` +
      ` WHERE (o.tags LIKE '%"website"%' OR o.tags LIKE '%contact:website%') AND g.og_checked IS NULL`
  ).first();

  return Response.json({ processed, withImage, remaining: rem.n });
}
