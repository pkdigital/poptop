// Shared OpenStreetMap / Overpass logic used by both the local seed script
// (scripts/seed.mjs) and the scheduled Worker refresh (src/worker.mjs).
//
// Data © OpenStreetMap contributors, licensed under the ODbL. Attribution is
// required wherever this data is shown. See migrations/0001_init.sql for the
// share-alike containment strategy.

// Public Overpass mirrors, tried in order. They get busy independently, so
// falling through to the next one is the normal path, not an edge case.
export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

// One query for the whole UK: facilities + formal sites/aires.
// `out center tags` returns a representative lat/lon even for ways/relations.
export const OVERPASS_QUERY = `
[out:json][timeout:180];
area["ISO3166-1"="GB"][admin_level=2]->.uk;
(
  nwr["tourism"="caravan_site"](area.uk);
  nwr["tourism"="camp_site"](area.uk);
  nwr["amenity"="sanitary_dump_station"](area.uk);
  nwr["sanitary_dump_station"](area.uk);
  nwr["amenity"="drinking_water"](area.uk);
  nwr["amenity"="water_point"](area.uk);
);
out center tags;
`.trim();

function categoryOf(tags) {
  if (tags.tourism === "caravan_site") return "caravan_site";
  if (tags.tourism === "camp_site") return "camp_site";
  if (tags.amenity === "sanitary_dump_station" || tags.sanitary_dump_station)
    return "dump_station";
  if (tags.amenity === "drinking_water") return "drinking_water";
  if (tags.amenity === "water_point") return "water_point";
  return "other";
}

const truthy = (v) => v === "yes" || v === "customers" || v === "permissive";

// Turn one raw Overpass element into a normalised place row, or null to skip.
export function normaliseElement(el) {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null) return null;

  const category = categoryOf(tags);
  const isWaterCat = category === "drinking_water" || category === "water_point";

  return {
    osm_id: `${el.type}/${el.id}`,
    name: tags.name ?? null,
    category,
    lat,
    lng,
    has_water: isWaterCat || truthy(tags.drinking_water) ? 1 : 0,
    has_dump:
      category === "dump_station" || truthy(tags.sanitary_dump_station) ? 1 : 0,
    has_toilets: truthy(tags.toilets) ? 1 : 0,
    fee: tags.fee ?? null,
    tags: JSON.stringify(tags),
    updated_at: new Date().toISOString(),
  };
}

export function normaliseAll(elements) {
  const out = [];
  for (const el of elements) {
    const row = normaliseElement(el);
    if (row) out.push(row);
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tryEndpoint(endpoint, fetchImpl) {
  const res = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "poptop/0.1 (UK motorhome stopover directory)",
    },
    body: "data=" + encodeURIComponent(OVERPASS_QUERY),
  });
  const text = await res.text();
  // Overpass signals "too busy"/runtime errors as HTML or a `remark`, often
  // still with HTTP 200 — so inspect the body, not just the status.
  if (!res.ok || !text.trimStart().startsWith("{")) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = JSON.parse(text);
  if (json.remark && /error|timeout|busy/i.test(json.remark)) {
    throw new Error(`remark: ${json.remark}`);
  }
  return normaliseAll(json.elements || []);
}

// Fetch + parse the UK extract. Works in Node and in the Workers runtime.
// Walks the mirror list with exponential backoff; throws only if all fail.
export async function fetchOsmPlaces(fetchImpl = fetch, { attempts = 3 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < attempts; attempt++) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        return await tryEndpoint(endpoint, fetchImpl);
      } catch (err) {
        lastErr = err;
        console.warn(`Overpass ${endpoint} failed: ${err.message}`);
      }
    }
    if (attempt < attempts - 1) await sleep(5000 * (attempt + 1));
  }
  throw new Error(`All Overpass mirrors failed. Last: ${lastErr?.message}`);
}
