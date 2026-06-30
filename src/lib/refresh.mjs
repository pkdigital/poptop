// Monthly OSM refresh: pull the UK extract and upsert into osm_places.
// Shared so both the cron worker and any manual trigger use identical logic.

import { fetchOsmPlaces } from "./overpass.mjs";

export async function refreshOsm(DB) {
  const places = await fetchOsmPlaces();
  const stmt = DB.prepare(
    `INSERT INTO osm_places` +
      ` (osm_id,name,category,lat,lng,has_water,has_dump,has_toilets,fee,tags,updated_at)` +
      ` VALUES (?,?,?,?,?,?,?,?,?,?,?)` +
      ` ON CONFLICT(osm_id) DO UPDATE SET` +
      ` name=excluded.name,category=excluded.category,lat=excluded.lat,lng=excluded.lng,` +
      ` has_water=excluded.has_water,has_dump=excluded.has_dump,has_toilets=excluded.has_toilets,` +
      ` fee=excluded.fee,tags=excluded.tags,updated_at=excluded.updated_at`
  );

  const batch = places.map((p) =>
    stmt.bind(
      p.osm_id, p.name, p.category, p.lat, p.lng,
      p.has_water, p.has_dump, p.has_toilets, p.fee, p.tags, p.updated_at
    )
  );

  for (let i = 0; i < batch.length; i += 100) {
    await DB.batch(batch.slice(i, i + 100));
  }
  return places.length;
}
