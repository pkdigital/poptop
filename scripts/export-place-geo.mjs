// Export the LOCAL place_geo enrichment cache (AI descriptions, og image/text,
// address, what3words) to scripts/place_geo.sql for loading into prod D1:
//   node scripts/export-place-geo.mjs
//   wrangler d1 execute poptop-db --remote --file=scripts/place_geo.sql
// Upserts by place_ref, so it's safe to re-run / re-load.

import { DatabaseSync } from "node:sqlite";
import { readdirSync, writeFileSync } from "node:fs";

const COLS = [
  "place_ref", "postcode", "district", "region", "w3w",
  "og_image", "og_status", "og_checked", "og_title", "og_desc",
  "ai_title", "ai_desc", "ai_checked", "cached_at",
];

const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const db = new DatabaseSync(`${dir}/${readdirSync(dir).find((f) => f.endsWith(".sqlite"))}`);

const q = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const rows = db.prepare(`SELECT ${COLS.join(", ")} FROM place_geo`).all();

const updates = COLS.filter((c) => c !== "place_ref")
  .map((c) => `${c}=excluded.${c}`).join(", ");

const lines = rows.map(
  (r) =>
    `INSERT INTO place_geo (${COLS.join(",")}) VALUES (${COLS.map((c) => q(r[c])).join(",")})` +
    ` ON CONFLICT(place_ref) DO UPDATE SET ${updates};`
);

const out = "-- Poptop enrichment cache (place_geo). © Poptop; OSM-derived fields per ODbL.\n" + lines.join("\n") + "\n";
writeFileSync("scripts/place_geo.sql", out);

const withAi = rows.filter((r) => r.ai_desc).length;
const withOg = rows.filter((r) => r.og_image).length;
console.log(`Wrote scripts/place_geo.sql — ${rows.length} rows (ai_desc: ${withAi}, og_image: ${withOg}).`);
console.log("Load to prod: wrangler d1 execute poptop-db --remote --file=scripts/place_geo.sql");
db.close();
