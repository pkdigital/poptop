// Resolve a website's preview image + classify the site, for the cron top-up.
// We cache ONLY the resolved image URL (hotlinked at render) — no bytes stored;
// the standard "link preview" model, and we always link back to the venue.
//
// Grading matches scripts/revalidate-images.mjs: we fetch each candidate the way
// a BROWSER on poptop will (our Referer + a browser UA), so hotlink-protected
// sites serve us the same block image the user would see, and we grade strictly
// (reject overlaid text, ads, watermarks, placeholders, graphics, low quality).

import Anthropic from "@anthropic-ai/sdk";

const UA = "poptop/0.1 (+https://poptop.uk; link preview)";
const TIMEOUT = 7000;
const REFERER = "https://poptop.uk/";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const MODEL = "claude-haiku-4-5";
const MEDIA = ["image/jpeg", "image/png", "image/gif", "image/webp"];

// --- strict photo grading (browser-perspective) ---
const PHOTO_SCHEMA = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false };
const PHOTO_PROMPT =
  "You are vetting a hero image for a campsite listing. Return {\"ok\": true} ONLY if it is a " +
  "clean photograph of a real place (site, pitch, building, landscape, outdoor scene) that would " +
  "look good as a header image. Return {\"ok\": false} if it has ANY of: overlaid text, captions, " +
  "prices or promotional wording; a watermark or logo; it's an advertisement/graphic/poster; a " +
  "'hotlink'/'image not available'/'do not steal' placeholder; a map, diagram or screenshot; or it's " +
  "blurry/low quality. When unsure, return false.";

// Grade the exact bytes a browser gets. Fails CLOSED (false) on any error.
async function isCleanPhoto(apiKey, url) {
  try {
    const img = await fetch(url, { headers: { Referer: REFERER, "User-Agent": BROWSER_UA }, redirect: "follow", signal: AbortSignal.timeout(10000) });
    if (!img.ok) return false;
    const media = MEDIA.find((t) => (img.headers.get("content-type") || "").includes(t));
    if (!media) return false;
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length < 3000 || buf.length > 4.5 * 1024 * 1024) return false;
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: MODEL, max_tokens: 40,
      output_config: { format: { type: "json_schema", schema: PHOTO_SCHEMA } },
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: media, data: buf.toString("base64") } },
        { type: "text", text: PHOTO_PROMPT },
      ] }],
    });
    return JSON.parse(res.content.find((b) => b.type === "text")?.text || "{}").ok === true;
  } catch {
    return false;
  }
}

// --- site classification (is it a real tourist campsite?) ---
const CLASS_SCHEMA = {
  type: "object",
  properties: { type: { type: "string", enum: ["tourist_campsite", "residential_park", "holiday_static", "closed", "unknown"] } },
  required: ["type"], additionalProperties: false,
};
const CLASS_SYSTEM =
  "You classify a UK site from its own website text, for a campervan/motorhome stopover directory. " +
  "Return exactly one type:\n" +
  "- tourist_campsite: offers short-stay touring/camping — tents, touring caravans, motorhomes/campervans, pitches, glamping, overnight or holiday stays.\n" +
  "- holiday_static: a holiday park of static caravans/lodges for hire or sale, with NO touring/tent pitches for visitors' own units.\n" +
  "- residential_park: permanent residential park homes / mobile homes to live in, or park homes for sale (not holidays).\n" +
  "- closed: the site is closed/permanently shut, or the page is a domain-for-sale/parking page.\n" +
  "- unknown: not enough information to tell.\n" +
  "If a place offers touring/tent/motorhome pitches at all, prefer tourist_campsite.";

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function classifySite(apiKey, html, title, desc) {
  try {
    const ctx = [title ? `Title: ${title}` : null, desc ? `Meta: ${desc}` : null, `Page text: ${htmlToText(html).slice(0, 3500)}`]
      .filter(Boolean).join("\n");
    const client = new Anthropic({ apiKey });
    const res = await client.messages.create({
      model: MODEL, max_tokens: 30, system: CLASS_SYSTEM,
      output_config: { format: { type: "json_schema", schema: CLASS_SCHEMA } },
      messages: [{ role: "user", content: ctx }],
    });
    return JSON.parse(res.content.find((b) => b.type === "text")?.text || "{}").type || "unknown";
  } catch {
    return "unknown";
  }
}

const BAD_IMG = /logo|favicon|sprite|placeholder|apple-touch|[-_/]icon|badge|pixel|spacer|avatar|banner|header|footer|1x1|blank/i;

function imageCandidates(html, baseUrl, max = 5) {
  const urls = new Set();
  for (const m of html.matchAll(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/gi)) {
    const a = absUrl(baseUrl, m[1]);
    if (a) urls.add(a);
  }
  return [...urls].filter((u) => /\.(jpe?g|webp)(\?|$)/i.test(u) && !BAD_IMG.test(u)).slice(0, max);
}

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

// Fetch the page once and pull preview image + title + description + raw html.
// Returns { html, finalUrl, image, title, desc } (fields may be null), or null.
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
    const html = (await res.text()).slice(0, 400000);

    let img = metaContent(html, ["og:image:secure_url", "og:image:url", "og:image", "twitter:image", "twitter:image:src"]);
    // (No apple-touch-icon fallback — that's an app icon/logo, not a photo.)
    img = img ? absUrl(res.url, img) : null;
    if (img && BAD_IMG.test(img)) img = null;

    let title = metaContent(html, ["og:title", "twitter:title"]);
    if (!title) title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || null;
    const desc = metaContent(html, ["og:description", "twitter:description", "description"]);

    return { html, finalUrl: res.url, image: img, title: clean(title, 200), desc: clean(desc, 600) };
  } catch {
    return null;
  }
}

// Confirm the image URL actually loads as a real image (cheap check for the
// no-apiKey path, e.g. the detail page).
export async function validateImage(imgUrl) {
  try {
    const res = await fetch(imgUrl, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return false;
    if (!(res.headers.get("content-type") || "").startsWith("image/")) return false;
    const len = Number(res.headers.get("content-length") || 0);
    if (len && len < 2500) return false;
    return true;
  } catch {
    return false;
  }
}

const CAMP = new Set(["camp_site", "caravan_site", "motorhome_parking"]);
const EXCLUDE_TYPE = new Set(["residential_park", "closed"]);

// Resolve a batch of not-yet-checked OSM places that have a website. Shared by
// the cron worker and the /api/resolve-og endpoint.
export async function resolveOgBatch(env, limit = 20) {
  const DB = env.DB;
  const apiKey = env.ANTHROPIC_API_KEY || null; // enables grading + classification
  const pending = await DB.prepare(
    `SELECT o.osm_id, o.category, o.tags FROM osm_places o` +
      ` LEFT JOIN place_geo g ON g.place_ref = 'osm/' || o.osm_id` +
      ` WHERE (o.tags LIKE '%"website"%' OR o.tags LIKE '%contact:website%')` +
      ` AND g.og_checked IS NULL LIMIT ?`
  ).bind(limit).all();

  const flags = await Promise.all(
    pending.results.map(async (r) => {
      let tags = {};
      try { tags = JSON.parse(r.tags); } catch {}
      const website = tags.website || tags["contact:website"];
      const og = await getOrFetchOg(DB, `osm/${r.osm_id}`, website, apiKey, r.category);
      return og?.image ? 1 : 0;
    })
  );
  return { processed: flags.length, withImage: flags.reduce((a, b) => a + b, 0) };
}

// Cached resolve for a place: classify the site, pick a clean hero photo (og
// first, then a gallery image for real campsites), and remember the result.
// Without apiKey (e.g. the detail page) it just validates the og image.
export async function getOrFetchOg(DB, ref, website, apiKey = null, category = null) {
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
  const isCamp = CAMP.has(category);
  let image = null, status = "no_image", siteType = null;

  if (og) {
    if (apiKey && isCamp && og.html) siteType = await classifySite(apiKey, og.html, title, desc);
    const excluded = EXCLUDE_TYPE.has(siteType);

    if (og.image && (await validateImage(og.image))) {
      if (!apiKey) { image = og.image; status = "ok"; }
      else if (await isCleanPhoto(apiKey, og.image)) { image = og.image; status = "ok"; }
      else status = "graphic";
    } else if (og.image) {
      status = "broken";
    }

    // Gallery fallback: only for genuine campsites with no usable og image.
    if (!image && apiKey && isCamp && !excluded && og.html) {
      for (const cand of imageCandidates(og.html, og.finalUrl)) {
        if (await isCleanPhoto(apiKey, cand)) { image = cand; status = "gallery"; break; }
      }
    }

    if (!image && status === "no_image" && (desc || title)) status = "text_only";
  } else {
    status = "broken";
  }

  const now = new Date().toISOString();
  await DB.prepare(
    `INSERT INTO place_geo (place_ref, og_image, og_title, og_desc, og_status, og_checked, site_type, site_checked, cached_at)` +
      ` VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)` +
      ` ON CONFLICT(place_ref) DO UPDATE SET og_image=excluded.og_image,` +
      ` og_title=excluded.og_title, og_desc=excluded.og_desc,` +
      ` og_status=excluded.og_status, og_checked=excluded.og_checked,` +
      ` site_type=excluded.site_type, site_checked=excluded.site_checked`
  ).bind(ref, image, title, desc, status, now, siteType, siteType ? now : null, now).run();

  return { image, title, desc };
}
