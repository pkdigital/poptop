// Resolve website og:image/title/description for all websited places, writing to
// the LOCAL D1 (node:sqlite). Then export + load to prod. No dev server needed.

import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { resolveOg, validateImage } from "../src/lib/ogimage.mjs";

const CONC = 10;
const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const db = new DatabaseSync(`${dir}/${readdirSync(dir).find((f) => f.endsWith(".sqlite"))}`);

const sel = db.prepare(
  "SELECT o.osm_id, o.tags FROM osm_places o" +
  " LEFT JOIN place_geo g ON g.place_ref=('osm/'||o.osm_id)" +
  " WHERE (o.tags LIKE '%\"website\"%' OR o.tags LIKE '%contact:website%')" +
  " AND g.og_checked IS NULL LIMIT 200"
);
const upsert = db.prepare(
  "INSERT INTO place_geo (place_ref, og_image, og_title, og_desc, og_status, og_checked, cached_at)" +
  " VALUES (?,?,?,?,?,?,?)" +
  " ON CONFLICT(place_ref) DO UPDATE SET og_image=excluded.og_image, og_title=excluded.og_title," +
  " og_desc=excluded.og_desc, og_status=excluded.og_status, og_checked=excluded.og_checked"
);

async function one(r) {
  let tags = {}; try { tags = JSON.parse(r.tags || "{}"); } catch {}
  const website = tags.website || tags["contact:website"];
  const og = website ? await resolveOg(website) : null;
  const title = og?.title || null, desc = og?.desc || null;
  let image = null, status = "no_image";
  if (og?.image) { image = (await validateImage(og.image)) ? og.image : null; status = image ? "ok" : "broken"; }
  else if (desc || title) status = "text_only";
  return { ref: `osm/${r.osm_id}`, image, title, desc, status };
}

let total = 0, withImg = 0;
const t0 = Date.now();
while (true) {
  const rows = sel.all();
  if (!rows.length) break;
  for (let i = 0; i < rows.length; i += CONC) {
    const out = await Promise.all(rows.slice(i, i + CONC).map(one));
    const now = new Date().toISOString();
    for (const x of out) { upsert.run(x.ref, x.image, x.title, x.desc, x.status, now, now); total++; if (x.image) withImg++; }
    console.log(`${new Date().toTimeString().slice(0,8)} done=${total} img=${withImg} (${((Date.now()-t0)/60000).toFixed(1)}m)`);
  }
}
console.log(`FINISHED total=${total} withImage=${withImg}`);
db.close();
