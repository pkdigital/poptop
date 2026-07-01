// Vision-grade stored og:images with Claude Haiku: keep real photos, null the
// logos/graphics/maps/screenshots/poor ones. Runs against the LOCAL D1; re-export
// + load to prod afterwards. Reads ANTHROPIC_API_KEY from .dev.vars.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5";
const CONC = 8;

const key = readFileSync(".dev.vars", "utf8").match(/ANTHROPIC_API_KEY=(.+)/)?.[1]?.trim();
const client = new Anthropic({ apiKey: key });
const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const db = new DatabaseSync(`${dir}/${readdirSync(dir).find((f) => f.endsWith(".sqlite"))}`);

const SCHEMA = { type: "object", properties: { photo: { type: "boolean" } }, required: ["photo"], additionalProperties: false };
const PROMPT =
  "This image is a candidate hero photo for a campsite/stopover listing. Is it a real " +
  "photograph of a place — a site, building, pitch, landscape or outdoor scene (true)? " +
  "Return false if it's a logo, icon, graphic, illustration, map, screenshot, a banner " +
  "that's mostly text, or very low quality. Return {\"photo\": boolean}.";

const MEDIA = ["image/jpeg", "image/png", "image/gif", "image/webp"];

async function isPhoto(url) {
  // Fetch bytes ourselves (Anthropic's URL fetcher fails on some hosts, e.g. Google Sites).
  const img = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!img.ok) throw new Error("fetch " + img.status);
  const media = MEDIA.find((t) => (img.headers.get("content-type") || "").includes(t));
  if (!media) throw new Error("not image");
  const buf = Buffer.from(await img.arrayBuffer());
  if (buf.length > 4.5 * 1024 * 1024) throw new Error("too big");
  const res = await client.messages.create({
    model: MODEL, max_tokens: 60,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: media, data: buf.toString("base64") } },
      { type: "text", text: PROMPT },
    ] }],
  });
  return JSON.parse(res.content.find((b) => b.type === "text")?.text || "{}").photo === true;
}

const rows = db.prepare("SELECT place_ref, og_image FROM place_geo WHERE og_image IS NOT NULL").all();
const drop = db.prepare("UPDATE place_geo SET og_image = NULL, og_status = 'graphic' WHERE place_ref = ?");

let done = 0, kept = 0, removed = 0, errored = 0;
const t0 = Date.now();
for (let i = 0; i < rows.length; i += CONC) {
  await Promise.all(rows.slice(i, i + CONC).map(async (r) => {
    try {
      if (await isPhoto(r.og_image)) kept++;
      else { drop.run(r.place_ref); removed++; }
    } catch { errored++; } // leave as-is on error
    done++;
  }));
  console.log(`${new Date().toTimeString().slice(0,8)} done=${done}/${rows.length} kept=${kept} removed=${removed} err=${errored} (${((Date.now()-t0)/60000).toFixed(1)}m)`);
}
console.log(`FINISHED of ${rows.length}: kept=${kept} removed=${removed} errored=${errored}`);
db.close();
