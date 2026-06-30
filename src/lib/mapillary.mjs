// Mapillary (free, open street-level imagery). Finds the nearest photo to a
// coordinate. Needs a free access token (MAPILLARY_TOKEN) from
// https://www.mapillary.com/dashboard/developers — degrades to null without one.

export async function nearestImageUrl(lat, lng, token, { size = 1024 } = {}) {
  if (!token) return null;
  const r = 0.006; // ~700m box — ~70% UK hit rate, still local to the place
  const bbox = `${lng - r},${lat - r},${lng + r},${lat + r}`;
  const field = `thumb_${size}_url`;
  const url =
    `https://graph.mapillary.com/images?fields=id,computed_geometry,${field}` +
    `&bbox=${bbox}&limit=10&access_token=${token}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const imgs = (await res.json()).data;
    if (!imgs?.length) return null;
    // Pick the photo closest to the target (bbox results aren't distance-sorted).
    let best = imgs[0];
    let bestD = Infinity;
    for (const im of imgs) {
      const g = im.computed_geometry?.coordinates; // [lng, lat]
      if (!g) continue;
      const dsq = (g[0] - lng) ** 2 + (g[1] - lat) ** 2;
      if (dsq < bestD) { bestD = dsq; best = im; }
    }
    return best[field] || null;
  } catch {
    return null;
  }
}
