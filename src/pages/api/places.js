import { queryPlaces } from "../../lib/places.mjs";

export const prerender = false;

// GET /api/places?n=&s=&e=&w=&category=&type=&limit=
export async function GET({ url, locals }) {
  const p = url.searchParams;
  const num = (k) => Number(p.get(k));
  const bbox = {
    n: num("n"), s: num("s"), e: num("e"), w: num("w"),
    category: p.get("category") || undefined,
    type: p.get("type") || undefined,
    limit: num("limit") || 500,
  };

  if ([bbox.n, bbox.s, bbox.e, bbox.w].some(Number.isNaN)) {
    return Response.json({ error: "n,s,e,w bbox params required" }, { status: 400 });
  }

  const data = await queryPlaces(locals.runtime.env.DB, bbox);
  return Response.json(data, {
    headers: { "cache-control": "public, max-age=300" },
  });
}
