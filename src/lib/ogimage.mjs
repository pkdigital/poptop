// Resolve a website's Open Graph preview image and validate that it loads.
// We cache ONLY the resolved URL (hotlinked at render) — no bytes stored.
// This is the standard "link preview" model (og:image is published for exactly
// this); we always link back to the venue.

const UA = "poptop/0.1 (+https://poptop.uk; link preview)";
const TIMEOUT = 7000;

const absUrl = (base, u) => { try { return new URL(u, base).href; } catch { return null; } };

function normalise(website) {
  let u = (website || "").trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

function metaContent(html, names) {
  for (const n of names) {
    const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*>`, "i"))?.[0];
    const c = tag?.match(/content=["']([^"']+)["']/i)?.[1];
    if (c) return c;
  }
  return null;
}

const clean = (s, n) => (s ? s.replace(/\s+/g, " ").trim().slice(0, n) : null);

// Fetch the page once and pull preview image + title + description.
// Returns { image, title, desc } (any may be null), or null on failure.
export async function resolveOg(website) {
  const url = normalise(website);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") || "").includes("text/html")) return null;
    const html = (await res.text()).slice(0, 250000);

    let img = metaContent(html, ["og:image:secure_url", "og:image:url", "og:image", "twitter:image", "twitter:image:src"]);
    if (!img) {
      const link = html.match(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*>/i)?.[0];
      img = link?.match(/href=["']([^"']+)["']/i)?.[1] || null;
    }
    let title = metaContent(html, ["og:title", "twitter:title"]);
    if (!title) title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || null;
    const desc = metaContent(html, ["og:description", "twitter:description", "description"]);

    return {
      image: img ? absUrl(res.url, img) : null,
      title: clean(title, 200),
      desc: clean(desc, 600),
    };
  } catch {
    return null;
  }
}

// Confirm the image URL actually loads as a real image (skip tiny logos/icons).
export async function validateImage(imgUrl) {
  try {
    const res = await fetch(imgUrl, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) return false;
    if (!(res.headers.get("content-type") || "").startsWith("image/")) return false;
    const len = Number(res.headers.get("content-length") || 0);
    if (len && len < 2500) return false; // too small to be a useful photo
    return true;
  } catch {
    return false;
  }
}

// Resolve a batch of not-yet-checked OSM places that have a website. Runs the
// batch concurrently. Shared by the cron worker and the /api/resolve-og endpoint.
export async function resolveOgBatch(DB, limit = 20) {
  const pending = await DB.prepare(
    `SELECT o.osm_id, o.tags FROM osm_places o` +
      ` LEFT JOIN place_geo g ON g.place_ref = 'osm/' || o.osm_id` +
      ` WHERE (o.tags LIKE '%"website"%' OR o.tags LIKE '%contact:website%')` +
      ` AND g.og_checked IS NULL LIMIT ?`
  ).bind(limit).all();

  const flags = await Promise.all(
    pending.results.map(async (r) => {
      let tags = {};
      try { tags = JSON.parse(r.tags); } catch {}
      const website = tags.website || tags["contact:website"];
      const og = await getOrFetchOg(DB, `osm/${r.osm_id}`, website);
      return og?.image ? 1 : 0;
    })
  );
  return { processed: flags.length, withImage: flags.reduce((a, b) => a + b, 0) };
}

// Cached resolve+validate for a place. Stores the validated URL + a status flag,
// and won't re-attempt once checked. Returns the usable image URL or null.
export async function getOrFetchOg(DB, ref, website) {
  const row = await DB.prepare(
    `SELECT og_image, og_title, og_desc, og_status FROM place_geo WHERE place_ref = ?`
  ).bind(ref).first();
  if (row && row.og_status) {
    return { image: row.og_image || null, title: row.og_title || null, desc: row.og_desc || null };
  }
  if (!website) return null;

  const og = await resolveOg(website);
  const title = og?.title || null;
  const desc = og?.desc || null;
  let image = null, status = "no_image";
  if (og?.image) {
    image = (await validateImage(og.image)) ? og.image : null;
    status = image ? "ok" : "broken";
  } else if (desc || title) {
    status = "text_only";
  }

  const now = new Date().toISOString();
  await DB.prepare(
    `INSERT INTO place_geo (place_ref, og_image, og_title, og_desc, og_status, og_checked, cached_at)` +
      ` VALUES (?, ?, ?, ?, ?, ?, ?)` +
      ` ON CONFLICT(place_ref) DO UPDATE SET og_image=excluded.og_image,` +
      ` og_title=excluded.og_title, og_desc=excluded.og_desc,` +
      ` og_status=excluded.og_status, og_checked=excluded.og_checked`
  ).bind(ref, image, title, desc, status, now, now).run();

  return { image, title, desc };
}
