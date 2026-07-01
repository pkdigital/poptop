// Build a contactable campsite list from the OSM data we already hold (ODbL).
// Reads a wrangler `--json` dump on stdin, writes CSV to the given path.
// Usage: wrangler d1 execute ... --json | node scripts/export-contacts.mjs out.csv
import { readFileSync, writeFileSync } from "node:fs";

const out = process.argv[2] || "campsite-contacts.csv";
const rows = JSON.parse(readFileSync(0, "utf8"))[0].results;

const CSV_COLS = ["name", "category", "town", "postcode", "website", "phone", "email", "lat", "lng", "osm_id", "osm_url"];
const csvCell = (v) => {
  const s = (v ?? "").toString();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const lines = [CSV_COLS.join(",")];
let withContact = 0;
for (const r of rows) {
  let t = {};
  try { t = JSON.parse(r.tags || "{}"); } catch {}
  const website = t.website || t["contact:website"] || "";
  const phone = t.phone || t["contact:phone"] || t["contact:mobile"] || "";
  const email = t.email || t["contact:email"] || "";
  if (!website && !phone && !email) continue; // contactable only
  withContact++;
  const rec = {
    name: r.name || "",
    category: r.category,
    town: t["addr:city"] || t["addr:town"] || t["addr:suburb"] || t["addr:village"] || "",
    postcode: t["addr:postcode"] || "",
    website, phone, email,
    lat: r.lat, lng: r.lng,
    osm_id: r.osm_id,
    osm_url: `https://www.openstreetmap.org/${r.osm_id}`,
  };
  lines.push(CSV_COLS.map((c) => csvCell(rec[c])).join(","));
}
writeFileSync(out, lines.join("\n") + "\n");
console.log(`Wrote ${out} — ${withContact} contactable of ${rows.length} stopover rows`);
