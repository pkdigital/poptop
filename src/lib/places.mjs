// Shared D1 read query: OSM facilities + APPROVED community listings in a bbox.
// Used by the JSON API (src/pages/api/places.js) and the SSR town pages.

export const ATTRIBUTION = "© OpenStreetMap contributors";

// Fetch one place by source + id, for the detail page. Returns null if missing
// (or a community listing that isn't approved).
export async function getPlace(DB, source, id) {
  if (source === "osm") {
    return (
      (await DB.prepare(
        `SELECT 'osm' AS source, osm_id AS id, name, category AS kind, lat, lng,` +
          ` has_water, has_dump, has_toilets, fee, tags FROM osm_places WHERE osm_id = ?`
      )
        .bind(id)
        .first()) || null
    );
  }
  if (source === "community") {
    return (
      (await DB.prepare(
        `SELECT 'community' AS source, id, name, type AS kind, lat, lng,` +
          ` description, facilities, contact FROM community_listings` +
          ` WHERE id = ? AND status = 'approved'`
      )
        .bind(id)
        .first()) || null
    );
  }
  return null;
}

export async function queryPlaces(DB, { n, s, e, w, category = null, type = null, limit = 500 }) {
  limit = Math.min(Number(limit) || 500, 50000);

  const osmSql =
    `SELECT 'osm' AS source, o.osm_id AS id, o.name, o.category AS kind, o.lat, o.lng,` +
    ` o.has_water, o.has_dump, o.has_toilets, o.fee,` +
    ` g.og_image AS og_image, g.site_type AS site_type FROM osm_places o` +
    ` LEFT JOIN place_geo g ON g.place_ref = 'osm/' || o.osm_id` +
    ` WHERE o.lat BETWEEN ? AND ? AND o.lng BETWEEN ? AND ?` +
    (category ? ` AND o.category = ?` : ``) +
    ` LIMIT ?`;
  const osmBind = [s, n, w, e, ...(category ? [category] : []), limit];

  const commSql =
    `SELECT 'community' AS source, id, name, type AS kind, lat, lng,` +
    ` description, facilities, contact FROM community_listings` +
    ` WHERE status = 'approved' AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?` +
    (type ? ` AND type = ?` : ``) +
    ` LIMIT ?`;
  const commBind = [s, n, w, e, ...(type ? [type] : []), limit];

  const [osm, comm] = await Promise.all([
    DB.prepare(osmSql).bind(...osmBind).all(),
    DB.prepare(commSql).bind(...commBind).all(),
  ]);

  return { attribution: ATTRIBUTION, osm: osm.results, community: comm.results };
}
