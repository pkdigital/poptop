// Mapillary (free, open street-level imagery). Finds the nearest photo to a
// coordinate. Needs a free access token (MAPILLARY_TOKEN) from
// https://www.mapillary.com/dashboard/developers — degrades to null without one.

// Contributors that overlay watermarks on their uploads — skip them.
const WATERMARKED = [/trekview/i];

const MAX_METRES = 80;  // only accept a photo this close
const MIN_QUALITY = 0.4; // Mapillary quality_score — drops blurry/poor captures

function metres(aLat, aLng, bLat, bLng) {
  const R = 6371000, dLat = ((bLat - aLat) * Math.PI) / 180, dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180, la2 = (bLat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

// Nearest usable image to a coordinate. Selective: excludes watermarked
// contributors and 360° panoramas (usually roadside/dashcam), and only accepts
// a photo within MAX_METRES. Returns { id, thumb } or null.
export async function nearestImage(lat, lng, token, { size = 1024 } = {}) {
  if (!token) return null;
  const r = 0.0016; // ~120m search box
  const bbox = `${lng - r},${lat - r},${lng + r},${lat + r}`;
  const field = `thumb_${size}_url`;
  const url =
    `https://graph.mapillary.com/images?fields=id,computed_geometry,creator,is_pano,${field}` +
    `&bbox=${bbox}&limit=30&access_token=${token}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const imgs = ((await res.json()).data || []).filter(
      (im) => !im.is_pano && !WATERMARKED.some((re) => re.test(im.creator?.username || ""))
    );
    let best = null, bestD = Infinity;
    for (const im of imgs) {
      const g = im.computed_geometry?.coordinates;
      if (!g) continue;
      const d = metres(lat, lng, g[1], g[0]);
      if (d < bestD) { bestD = d; best = im; }
    }
    if (!best || bestD > MAX_METRES) return null; // too far to be representative
    return { id: best.id, thumb: best[field] || null };
  } catch {
    return null;
  }
}

// Current thumbnail URL for a pinned image id.
export async function thumbForId(id, token, { size = 1024 } = {}) {
  if (!token || !id) return null;
  try {
    const res = await fetch(
      `https://graph.mapillary.com/${id}?fields=thumb_${size}_url&access_token=${token}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    return (await res.json())[`thumb_${size}_url`] || null;
  } catch {
    return null;
  }
}

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
