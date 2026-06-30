import { nearestImage, thumbForId } from "../../lib/mapillary.mjs";

export const prerender = false;

// GET /api/streetview?ref=osm/node/1&lat=&lng=
// Returns a STABLE Mapillary photo for the place: the chosen image id is pinned
// in place_geo on first request (watermarked sources excluded), so every render
// shows the same photo. Edge-cached; 404 when there's no usable image.
export async function GET({ url, locals, request }) {
  const p = url.searchParams;
  const lat = Number(p.get("lat"));
  const lng = Number(p.get("lng"));
  const ref = p.get("ref");
  const env = locals.runtime.env;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return new Response(null, { status: 400 });

  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) { const hit = await cache.match(request); if (hit) return hit; }

  let thumb = null;
  if (ref) {
    const row = await env.DB.prepare(
      "SELECT mly_id, mly_checked FROM place_geo WHERE place_ref = ?"
    ).bind(ref).first();
    if (row?.mly_checked) {
      if (row.mly_id) thumb = await thumbForId(row.mly_id, env.MAPILLARY_TOKEN);
    } else {
      const img = await nearestImage(lat, lng, env.MAPILLARY_TOKEN);
      const now = new Date().toISOString();
      await env.DB.prepare(
        "INSERT INTO place_geo (place_ref, mly_id, mly_checked, cached_at) VALUES (?, ?, ?, ?)" +
          " ON CONFLICT(place_ref) DO UPDATE SET mly_id=excluded.mly_id, mly_checked=excluded.mly_checked"
      ).bind(ref, img?.id || null, now, now).run();
      thumb = img?.thumb || null;
    }
  } else {
    thumb = (await nearestImage(lat, lng, env.MAPILLARY_TOKEN))?.thumb || null;
  }

  let resp;
  if (!thumb) {
    resp = new Response(null, { status: 404, headers: { "cache-control": "public, max-age=86400" } });
  } else {
    const img = await fetch(thumb);
    resp = img.ok
      ? new Response(img.body, {
          headers: {
            "content-type": img.headers.get("content-type") || "image/jpeg",
            "cache-control": "public, max-age=2592000",
          },
        })
      : new Response(null, { status: 404, headers: { "cache-control": "public, max-age=86400" } });
  }
  if (cache) locals.runtime.ctx?.waitUntil(cache.put(request, resp.clone()));
  return resp;
}
