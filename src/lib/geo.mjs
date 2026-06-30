// Location enrichment for detail pages.

// Nearest UK postcode + admin area. postcodes.io is free, no key, UK-only.
export async function reverseUk(lat, lng) {
  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes?lon=${lng}&lat=${lat}&limit=1&radius=2000`
    );
    if (!res.ok) return null;
    const j = await res.json();
    const p = j.result && j.result[0];
    if (!p) return null;
    return {
      postcode: p.postcode,
      district: p.admin_district,
      region: p.region || p.country,
    };
  } catch {
    return null;
  }
}

// NOTE: coordinates -> words (convert-to-3wa) is a PAID what3words feature; the
// free plan only offers AutoSuggest (validating a w3w address a user types).
// So we do NOT auto-derive w3w from coordinates. The `w3w` column is populated
// only by user-provided addresses on the submission form (validated client-side
// with the free AutoSuggest API), then displayed as plain text + a link to
// what3words.com (which needs no API call).

// Validate a user-typed what3words address via the free AutoSuggest API.
// Returns the matched "filled.count.soap" or null. For the submission form.
export async function autosuggestW3w(input, key, { focusLat, focusLng } = {}) {
  if (!key || !input) return null;
  try {
    const focus = focusLat != null ? `&focus=${focusLat},${focusLng}` : "";
    const res = await fetch(
      `https://api.what3words.com/v3/autosuggest?input=${encodeURIComponent(input)}&n-results=1${focus}&key=${key}`
    );
    if (!res.ok) return null;
    const j = await res.json();
    return j.suggestions?.[0]?.words || null;
  } catch {
    return null;
  }
}

// Cached address for a place (postcodes.io). Fetched once, then reused. w3w is
// left as-is (set only via user submission, never derived from coordinates).
export async function getOrFetchGeo(DB, ref, lat, lng) {
  let row = await DB.prepare(
    `SELECT postcode, district, region, w3w FROM place_geo WHERE place_ref = ?`
  ).bind(ref).first();

  if (!row || row.postcode == null) {
    const addr = await reverseUk(lat, lng);
    row = {
      postcode: addr?.postcode ?? row?.postcode ?? null,
      district: addr?.district ?? row?.district ?? null,
      region: addr?.region ?? row?.region ?? null,
      w3w: row?.w3w ?? null,
    };
    await DB.prepare(
      `INSERT INTO place_geo (place_ref, postcode, district, region, w3w, cached_at)` +
        ` VALUES (?, ?, ?, ?, ?, ?)` +
        ` ON CONFLICT(place_ref) DO UPDATE SET postcode=excluded.postcode,` +
        ` district=excluded.district, region=excluded.region,` +
        ` cached_at=excluded.cached_at`
    )
      .bind(ref, row.postcode, row.district, row.region, row.w3w, new Date().toISOString())
      .run();
  }
  return row;
}
