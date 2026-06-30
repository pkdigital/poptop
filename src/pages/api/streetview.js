import { nearestImageUrl } from "../../lib/mapillary.mjs";

export const prerender = false;

// GET /api/streetview?lat=&lng=  -> nearest Mapillary photo (streamed), or 404.
// Edge-cached so each location is looked up once; token stays server-side.
export async function GET({ url, locals, request }) {
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const env = locals.runtime.env;
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return new Response(null, { status: 400 });
  }

  // caches.default exists in deployed Workers but not in local dev.
  const cache = typeof caches !== "undefined" ? caches.default : null;
  if (cache) {
    const hit = await cache.match(request);
    if (hit) return hit;
  }

  const thumb = await nearestImageUrl(lat, lng, env.MAPILLARY_TOKEN);
  let resp;
  if (!thumb) {
    // Cache the "no coverage" answer for a day so we don't re-query constantly.
    resp = new Response(null, { status: 404, headers: { "cache-control": "public, max-age=86400" } });
  } else {
    const img = await fetch(thumb);
    if (!img.ok) {
      resp = new Response(null, { status: 404, headers: { "cache-control": "public, max-age=86400" } });
    } else {
      resp = new Response(img.body, {
        headers: {
          "content-type": img.headers.get("content-type") || "image/jpeg",
          "cache-control": "public, max-age=2592000",
        },
      });
    }
  }
  if (cache) locals.runtime.ctx?.waitUntil(cache.put(request, resp.clone()));
  return resp;
}
