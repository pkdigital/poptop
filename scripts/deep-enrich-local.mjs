// Deep enrichment from each campsite's OWN website (one fetch per site):
//   1) Classify site_type: tourist_campsite | residential_park | holiday_static | closed | unknown
//      -> lets us exclude residential/static "park home" estates from the directory.
//   2) If it's a real campsite with no photo yet, find a gallery image, vision-grade
//      it, and store as og_image (og_status='gallery').
// Reads ANTHROPIC_API_KEY from .dev.vars. Writes to the LOCAL D1 the other scripts
// use; run export-place-geo.mjs afterwards and load to prod.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5";
const CONC = 10;
const MAX_IMG_CANDIDATES = 5;
const UA = "poptop/0.1 (+https://poptop.uk; listing enrichment)";

const key = readFileSync(".dev.vars", "utf8").match(/ANTHROPIC_API_KEY=(.+)/)?.[1]?.trim();
const client = new Anthropic({ apiKey: key });
const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const db = new DatabaseSync(`${dir}/${readdirSync(dir).find((f) => f.endsWith(".sqlite"))}`);

// ---------- classification ----------
const CLASS_SCHEMA = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["tourist_campsite", "residential_park", "holiday_static", "closed", "unknown"] },
  },
  required: ["type"],
  additionalProperties: false,
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

async function classify(name, title, desc, text) {
  const ctx = [
    name ? `Name: ${name}` : null,
    title ? `Title: ${title}` : null,
    desc ? `Meta: ${desc}` : null,
    `Page text: ${text.slice(0, 3500)}`,
  ].filter(Boolean).join("\n");
  const res = await client.messages.create({
    model: MODEL, max_tokens: 30, system: CLASS_SYSTEM,
    output_config: { format: { type: "json_schema", schema: CLASS_SCHEMA } },
    messages: [{ role: "user", content: ctx }],
  });
  return JSON.parse(res.content.find((b) => b.type === "text")?.text || "{}").type || "unknown";
}

// ---------- gallery image discovery + vision grading ----------
const IMG_MEDIA = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const PHOTO_SCHEMA = { type: "object", properties: { photo: { type: "boolean" } }, required: ["photo"], additionalProperties: false };
const PHOTO_PROMPT =
  "Candidate hero photo for a campsite listing. Real photograph of a place — site, pitch, " +
  "building, landscape or outdoor scene (true)? False if logo, icon, graphic, map, screenshot, " +
  "banner that's mostly text, or very low quality. Return {\"photo\": boolean}.";
const BAD_IMG = /logo|favicon|sprite|placeholder|apple-touch|[-_/]icon|badge|pixel|spacer|avatar|banner|header|footer|1x1|blank/i;

const absUrl = (base, u) => { try { return new URL(u, base).href; } catch { return null; } };

function imageCandidates(html, baseUrl) {
  const urls = new Set();
  const og = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image(?::secure_url|:url)?|twitter:image)["'][^>]*>/i)?.[0];
  const ogc = og?.match(/content=["']([^"']+)["']/i)?.[1];
  if (ogc) { const a = absUrl(baseUrl, ogc); if (a) urls.add(a); }
  for (const m of html.matchAll(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/gi)) {
    const a = absUrl(baseUrl, m[1]);
    if (a) urls.add(a);
  }
  return [...urls]
    .filter((u) => /\.(jpe?g|webp)(\?|$)/i.test(u) && !BAD_IMG.test(u))
    .slice(0, MAX_IMG_CANDIDATES);
}

async function isRealPhoto(url) {
  try {
    const img = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(12000) });
    if (!img.ok) return false;
    const media = IMG_MEDIA.find((t) => (img.headers.get("content-type") || "").includes(t));
    if (!media) return false;
    const buf = Buffer.from(await img.arrayBuffer());
    if (buf.length < 3000 || buf.length > 4.5 * 1024 * 1024) return false;
    const res = await client.messages.create({
      model: MODEL, max_tokens: 60,
      output_config: { format: { type: "json_schema", schema: PHOTO_SCHEMA } },
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: media, data: buf.toString("base64") } },
        { type: "text", text: PHOTO_PROMPT },
      ] }],
    });
    return JSON.parse(res.content.find((b) => b.type === "text")?.text || "{}").photo === true;
  } catch { return false; }
}

// ---------- main ----------
const rows = db.prepare(
  `SELECT o.osm_id, o.name, o.tags, g.og_image, g.og_title, g.og_desc
   FROM osm_places o
   LEFT JOIN place_geo g ON g.place_ref = 'osm/' || o.osm_id
   WHERE o.category IN ('camp_site','caravan_site','motorhome_parking')
     AND (o.tags LIKE '%"website"%' OR o.tags LIKE '%contact:website%')
     AND (g.site_checked IS NULL)`
).all();

const LIMIT = Number(process.argv[2]) || 0; // optional: test on first N
const work = LIMIT ? rows.slice(0, LIMIT) : rows;

const upsert = db.prepare(
  `INSERT INTO place_geo (place_ref, site_type, site_checked, og_image, og_status, cached_at)
   VALUES (:ref, :type, :now, :img, :ogstatus, :now)
   ON CONFLICT(place_ref) DO UPDATE SET
     site_type=excluded.site_type, site_checked=excluded.site_checked,
     og_image=COALESCE(place_geo.og_image, excluded.og_image),
     og_status=CASE WHEN place_geo.og_image IS NULL AND excluded.og_image IS NOT NULL
                    THEN excluded.og_status ELSE place_geo.og_status END`
);

const ALLOW_PHOTO = new Set(["tourist_campsite", "holiday_static"]);
const norm = (w) => (/^https?:\/\//i.test(w) ? w : "https://" + w);
const now0 = new Date().toISOString();
let done = 0, byType = {}, gotPhoto = 0, err = 0;
const t0 = Date.now();

for (let i = 0; i < work.length; i += CONC) {
  await Promise.all(work.slice(i, i + CONC).map(async (r) => {
    const ref = `osm/${r.osm_id}`;
    let tags = {}; try { tags = JSON.parse(r.tags || "{}"); } catch {}
    const website = tags.website || tags["contact:website"];
    let type = "unknown", img = null, ogstatus = null;
    try {
      const res = await fetch(norm(website), { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(12000) });
      if (res.ok && (res.headers.get("content-type") || "").includes("text/html")) {
        const html = (await res.text()).slice(0, 400000);
        const text = htmlToText(html);
        type = await classify(r.name, r.og_title, r.og_desc, text);
        // Only hunt for a photo if it's a real campsite AND we don't have one.
        if (!r.og_image && ALLOW_PHOTO.has(type)) {
          for (const cand of imageCandidates(html, res.url)) {
            if (await isRealPhoto(cand)) { img = cand; ogstatus = "gallery"; gotPhoto++; break; }
          }
        }
      } else if (!res.ok) {
        type = res.status === 404 || res.status === 410 ? "closed" : "unknown";
      }
    } catch { err++; }
    upsert.run({ ref, type, now: new Date().toISOString(), img, ogstatus });
    byType[type] = (byType[type] || 0) + 1;
    done++;
  }));
  if (done % 60 < CONC) {
    console.log(`${new Date().toTimeString().slice(0,8)} done=${done}/${work.length} photos+=${gotPhoto} err=${err} (${((Date.now()-t0)/60000).toFixed(1)}m) ${JSON.stringify(byType)}`);
  }
}
console.log(`FINISHED ${done}/${work.length} — new photos: ${gotPhoto}, errors: ${err}`);
console.log("types:", JSON.stringify(byType, null, 0));
db.close();
void now0;
