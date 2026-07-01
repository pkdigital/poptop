// Detect same-place duplicates in OSM camp/caravan data (a pin AND a polygon for
// one site, or two mappers adding the same place) and emit DELETEs for the
// redundant rows. Same normalised name within ~250m = one cluster; we keep the
// richest record and drop the rest.
//   wrangler d1 execute poptop-db --remote --json --command "<dump>" | node scripts/dedup-osm.mjs
//   wrangler d1 execute poptop-db --remote --file=scripts/dedup.sql   (after review)
import { readFileSync, writeFileSync } from "node:fs";

const rows = JSON.parse(readFileSync(0, "utf8"))[0].results;

const STOP = ["the", "and", "campsite", "camping", "caravan", "park", "site", "farm", "club", "holiday", "holidays", "touring", "cc", "co", "ltd"];
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.includes(w)).sort().join(" ");
const mi = (a, b, c, d) => { const R = 3958.8, dl = (c - a) * Math.PI / 180, dn = (d - b) * Math.PI / 180, x = Math.sin(dl / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(dn / 2) ** 2; return R * 2 * Math.asin(Math.sqrt(x)); };

// Higher score = better keeper: has a photo, then polygon(way/relation), then detail.
const typeRank = (id) => (id.startsWith("relation/") ? 2 : id.startsWith("way/") ? 1 : 0);
const score = (r) => (r.og_image ? 1e6 : 0) + typeRank(r.osm_id) * 1e4 + (r.tags ? r.tags.length : 0);

const groups = {};
for (const r of rows) { const k = norm(r.name); if (k) (groups[k] = groups[k] || []).push(r); }

const remove = [];
let clusters = 0;
for (const k in groups) {
  const a = groups[k];
  if (a.length < 2) continue;
  const used = new Set();
  for (let i = 0; i < a.length; i++) {
    if (used.has(i)) continue;
    const grp = [a[i]];
    for (let j = i + 1; j < a.length; j++) {
      if (used.has(j)) continue;
      if (mi(a[i].lat, a[i].lng, a[j].lat, a[j].lng) < 0.155) { grp.push(a[j]); used.add(j); }
    }
    if (grp.length > 1) {
      clusters++;
      grp.sort((x, y) => score(y) - score(x));
      const keep = grp[0];
      for (const d of grp.slice(1)) remove.push({ del: d.osm_id, kept: keep.osm_id, name: d.name });
    }
  }
}

const ids = remove.map((r) => `'${r.del.replace(/'/g, "''")}'`).join(",");
const sql = `-- Poptop OSM dedup: remove ${remove.length} redundant records (${clusters} clusters).\n` +
  (ids ? `DELETE FROM osm_places WHERE osm_id IN (${ids});\n` : "");
writeFileSync("scripts/dedup.sql", sql);
console.log(`clusters: ${clusters}, removing: ${remove.length}`);
console.log("keepers with a photo:", remove.length ? new Set(remove.map((r) => r.kept)).size : 0, "distinct kept refs");
for (const r of remove.slice(0, 15)) console.log(`  drop ${r.del} (keep ${r.kept}) — ${r.name}`);
console.log("Wrote scripts/dedup.sql");
