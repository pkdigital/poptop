import { queryPlaces } from "../../lib/places.mjs";
import { kindLabel } from "../../lib/format.mjs";

export const prerender = false;

const STOPOVER = new Set(["caravan_site", "camp_site", "aire", "pub", "driveway", "site", "motorhome_parking", "other"]);
// Facilities are expected to be themed tiles — always shown. Stopovers are shown
// "photo-first": only genuine campsites with a real photo (the shop window),
// never residential/static "park home" estates or closed sites.
const FACILITY = new Set(["drinking_water", "water_point", "dump_station", "toilets", "lpg"]);
const EXCLUDE_TYPE = new Set(["residential_park", "closed"]);

// All UK points as a GeoJSON FeatureCollection for client-side clustering.
// Cached at the edge for an hour — the data only changes on the monthly refresh.
export async function GET({ locals }) {
  const data = await queryPlaces(locals.runtime.env.DB, {
    n: 61, s: 49.5, e: 2.2, w: -9, limit: 40000,
  });

  const toFeature = (p, flags, img) => ({
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
      img: img || null,
      ...flags,
    },
  });

  const features = [];

  for (const p of data.community) {
    let f = {};
    try { f = p.facilities ? JSON.parse(p.facilities) : {}; } catch {}
    features.push(toFeature(p, {
      water: f.water ? 1 : 0,
      waste: f.waste || f.dump ? 1 : 0,
      toilets: f.toilet || f.toilets ? 1 : 0,
    }, null));
  }

  for (const p of data.osm) {
    if (!FACILITY.has(p.kind)) {
      // Stopover: exclude non-campsites, and require a real photo (photo-first).
      if (EXCLUDE_TYPE.has(p.site_type)) continue;
      if (!p.og_image) continue;
    }
    features.push(toFeature(p, {
      water: p.has_water ? 1 : 0,
      waste: p.has_dump ? 1 : 0,
      toilets: p.has_toilets ? 1 : 0,
    }, p.og_image));
  }

  // Short browser cache so filter/data changes self-heal quickly; longer shared
  // (edge) cache since the data only changes when we re-sync. Never cache in dev.
  const cache = import.meta.env.DEV
    ? "no-store"
    : "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";
  return Response.json(
    { type: "FeatureCollection", features },
    { headers: { "cache-control": cache } }
  );
}
