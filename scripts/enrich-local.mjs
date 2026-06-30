// Full AI enrichment against the LOCAL D1 sqlite, no dev server needed.
// node:sqlite + Anthropic SDK. Reads ANTHROPIC_API_KEY from .dev.vars.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { kindLabel } from "../src/lib/format.mjs";

const MODEL = "claude-haiku-4-5";
const CONC = 8;

const key = readFileSync(".dev.vars", "utf8").match(/ANTHROPIC_API_KEY=(.+)/)?.[1]?.trim();
if (!key) { console.error("no ANTHROPIC_API_KEY in .dev.vars"); process.exit(1); }
const client = new Anthropic({ apiKey: key });

const d1dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const file = readdirSync(d1dir).find((f) => f.endsWith(".sqlite"));
const db = new DatabaseSync(`${d1dir}/${file}`);

const SCHEMA = {
  type: "object",
  properties: { title: { type: "string" }, description: { type: "string" } },
  required: ["title", "description"],
  additionalProperties: false,
};
const SYSTEM =
  "You write concise, factual directory entries for a UK motorhome & campervan " +
  "stopover and facilities website. British English. No marketing fluff, no emoji, " +
  "never invent facts. Title: a clean name (<=60 chars). Description: 1–2 plain " +
  "sentences (<=240 chars) on what it is and useful facilities. If little is known, keep it short.";

function contextFor(r, tags) {
  const p = (k) => tags[k];
  return [
    `Type: ${kindLabel(r.category)}`,
    r.name ? `Name: ${r.name}` : null,
    p("operator") ? `Operator: ${p("operator")}` : null,
    p("addr:city") || p("addr:town") ? `Town: ${p("addr:city") || p("addr:town")}` : null,
    p("addr:postcode") ? `Postcode: ${p("addr:postcode")}` : null,
    p("description") ? `OSM description: ${p("description")}` : null,
    p("opening_hours") ? `Opening hours: ${p("opening_hours")}` : null,
    p("fee") ? `Fee: ${p("fee")}` : null,
    r.has_water ? "Has drinking water" : null,
    r.has_dump ? "Has waste/Elsan disposal" : null,
    r.has_toilets ? "Has toilets" : null,
    r.og_desc ? `Website summary: ${r.og_desc}` : null,
  ].filter(Boolean).join("\n");
}

async function generate(ctx) {
  const res = await client.messages.create({
    model: MODEL, max_tokens: 400, system: SYSTEM,
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: ctx }],
  });
  const j = JSON.parse(res.content.find((b) => b.type === "text")?.text || "{}");
  return { title: (j.title || "").slice(0, 80) || null, desc: (j.description || "").slice(0, 300) || null };
}

const sel = db.prepare(
  "SELECT o.osm_id, o.name, o.category, o.has_water, o.has_dump, o.has_toilets, o.tags, g.og_desc" +
  " FROM osm_places o LEFT JOIN place_geo g ON g.place_ref=('osm/'||o.osm_id)" +
  " WHERE o.category IN ('caravan_site','camp_site','motorhome_parking') AND g.ai_checked IS NULL LIMIT 200"
);
const upsert = db.prepare(
  "INSERT INTO place_geo (place_ref, ai_title, ai_desc, ai_checked, cached_at) VALUES (?,?,?,?,?)" +
  " ON CONFLICT(place_ref) DO UPDATE SET ai_title=excluded.ai_title, ai_desc=excluded.ai_desc, ai_checked=excluded.ai_checked"
);

let total = 0, ok = 0;
const t0 = Date.now();
while (true) {
  const rows = sel.all();
  if (!rows.length) break;
  for (let i = 0; i < rows.length; i += CONC) {
    const slice = rows.slice(i, i + CONC);
    const out = await Promise.all(slice.map(async (r) => {
      let tags = {}; try { tags = JSON.parse(r.tags || "{}"); } catch {}
      try { const o = await generate(contextFor(r, tags)); return { ref: `osm/${r.osm_id}`, ...o }; }
      catch { return { ref: `osm/${r.osm_id}`, title: null, desc: null }; }
    }));
    const now = new Date().toISOString();
    for (const x of out) { upsert.run(x.ref, x.title, x.desc, now, now); total++; if (x.desc) ok++; }
    const mins = ((Date.now() - t0) / 60000).toFixed(1);
    console.log(`${new Date().toTimeString().slice(0, 8)} done=${total} ok=${ok} (${mins}m)`);
  }
}
console.log(`FINISHED total=${total} ok=${ok}`);
db.close();
