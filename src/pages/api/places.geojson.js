import { queryPlaces } from "../../lib/places.mjs";
import { kindLabel } from "../../lib/format.mjs";

export const prerender = false;

// All UK points as a GeoJSON FeatureCollection for client-side clustering.
// Cached at the edge for an hour — the data only changes on the monthly refresh.
export async function GET({ locals }) {
  const data = await queryPlaces(locals.runtime.env.DB, {
    n: 61, s: 49.5, e: 2.2, w: -9, limit: 40000,
  });

  const STOPOVER = new Set(["caravan_site", "camp_site", "aire", "pub", "driveway", "site", "other"]);

  // Cached website preview images, keyed by "source/id".
  const og = await locals.runtime.env.DB.prepare(
    `SELECT place_ref, og_image FROM place_geo WHERE og_image IS NOT NULL`
  ).all();
  const ogMap = new Map(og.results.map((r) => [r.place_ref, r.og_image]));

  const toFeature = (p, flags) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    properties: {
      id: p.id,
      kind: p.kind || "other",
      // Many OSM facilities (water taps, dump points) have no name — fall back
      // to the category so nothing shows as "Unnamed".
      label: p.name || kindLabel(p.kind),
      kindLabel: kindLabel(p.kind),
      source: p.source,
      stopover: STOPOVER.has(p.kind) ? 1 : 0,
      img: ogMap.get(`${p.source}/${p.id}`) || null,
      ...flags,
    },
  });

  const features = [
    ...data.community.map((p) => {
      let f = {};
      try { f = p.facilities ? JSON.parse(p.facilities) : {}; } catch {}
      return toFeature(p, {
        water: f.water ? 1 : 0,
        waste: f.waste || f.dump ? 1 : 0,
        toilets: f.toilet || f.toilets ? 1 : 0,
      });
    }),
    ...data.osm.map((p) =>
      toFeature(p, {
        water: p.has_water ? 1 : 0,
        waste: p.has_dump ? 1 : 0,
        toilets: p.has_toilets ? 1 : 0,
      })
    ),
  ];

  // Long edge cache in prod (data only changes monthly); never cache in dev so
  // schema changes show up immediately on refresh.
  const cache = import.meta.env.DEV ? "no-store" : "public, max-age=3600";
  return Response.json(
    { type: "FeatureCollection", features },
    { headers: { "cache-control": cache } }
  );
}
