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

// Fetch the page and pull the best preview image URL (absolute), or null.
export async function resolveOgImage(website) {
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
    return img ? absUrl(res.url, img) : null;
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

// Cached resolve+validate for a place. Stores the validated URL + a status flag,
// and won't re-attempt once checked. Returns the usable image URL or null.
export async function getOrFetchOg(DB, ref, website) {
  const row = await DB.prepare(
    `SELECT og_image, og_status FROM place_geo WHERE place_ref = ?`
  ).bind(ref).first();
  if (row && row.og_status) return row.og_image || null; // already attempted
  if (!website) return null;

  const img = await resolveOgImage(website);
  let status = "no_image", finalUrl = null;
  if (img) {
    status = (await validateImage(img)) ? "ok" : "broken";
    if (status === "ok") finalUrl = img;
  }

  const now = new Date().toISOString();
  await DB.prepare(
    `INSERT INTO place_geo (place_ref, og_image, og_status, og_checked, cached_at)` +
      ` VALUES (?, ?, ?, ?, ?)` +
      ` ON CONFLICT(place_ref) DO UPDATE SET og_image=excluded.og_image,` +
      ` og_status=excluded.og_status, og_checked=excluded.og_checked`
  ).bind(ref, finalUrl, status, now, now).run();

  return finalUrl;
}
