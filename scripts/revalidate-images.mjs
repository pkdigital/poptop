// Re-validate every stored og_image the way a BROWSER on poptop will actually
// load it: fetch with our Referer + a browser UA (so hotlink-protection serves
// us the same block/placeholder image the user sees), then vision-grade STRICTLY
// — reject overlaid text, ads, watermarks, "image hotlinked" placeholders,
// graphics, maps. Drops anything that isn't a clean, browser-loadable photo.
// Run export-place-geo.mjs afterwards and load to prod.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5";
const CONC = 10;
const REFERER = "https://poptop.psclancy.workers.dev/";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const key = readFileSync(".dev.vars", "utf8").match(/ANTHROPIC_API_KEY=(.+)/)?.[1]?.trim();
const client = new Anthropic({ apiKey: key });
const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const db = new DatabaseSync(`${dir}/${readdirSync(dir).find((f) => f.endsWith(".sqlite"))}`);

const MEDIA = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const SCHEMA = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false };
const PROMPT =
  "You are vetting a hero image for a campsite listing. Return {\"ok\": true} ONLY if it is a " +
  "clean photograph of a real place (site, pitch, building, landscape, outdoor scene) that would " +
  "look good as a header image. Return {\"ok\": false} if it has ANY of: overlaid text, captions, " +
  "prices or promotional wording; a watermark or logo; it's an advertisement/graphic/poster; a " +
  "'hotlink'/'image not available'/'do not steal' placeholder; a map, diagram or screenshot; or it's " +
  "blurry/low quality. When unsure, return false.";

async function isCleanPhoto(url) {
  const img = await fetch(url, { headers: { Referer: REFERER, "User-Agent": BROWSER_UA }, redirect: "follow", signal: AbortSignal.timeout(12000) });
  if (!img.ok) return false;
  const media = MEDIA.find((t) => (img.headers.get("content-type") || "").includes(t));
  if (!media) return false;
  const buf = Buffer.from(await img.arrayBuffer());
  if (buf.length < 3000 || buf.length > 4.5 * 1024 * 1024) return false;
  const res = await client.messages.create({
    model: MODEL, max_tokens: 40,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: media, data: buf.toString("base64") } },
      { type: "text", text: PROMPT },
    ] }],
  });
  return JSON.parse(res.content.find((b) => b.type === "text")?.text || "{}").ok === true;
}

const rows = db.prepare("SELECT place_ref, og_image, og_status FROM place_geo WHERE og_image IS NOT NULL").all();
const drop = db.prepare("UPDATE place_geo SET og_image = NULL, og_status = ? WHERE place_ref = ?");

let done = 0, kept = 0, dropped = 0, err = 0;
const t0 = Date.now();
for (let i = 0; i < rows.length; i += CONC) {
  await Promise.all(rows.slice(i, i + CONC).map(async (r) => {
    try {
      if (await isCleanPhoto(r.og_image)) kept++;
      else { drop.run(r.og_status === "gallery" ? "gallery_dropped" : "og_dropped", r.place_ref); dropped++; }
    } catch { err++; } // transient network error: leave as-is, re-check next run
    done++;
  }));
  if (done % 100 < CONC) console.log(`${new Date().toTimeString().slice(0,8)} done=${done}/${rows.length} kept=${kept} dropped=${dropped} err=${err} (${((Date.now()-t0)/60000).toFixed(1)}m)`);
}
console.log(`FINISHED ${done}/${rows.length}: kept=${kept} dropped=${dropped} (incl err ${err})`);
db.close();
