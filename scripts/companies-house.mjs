// Companies House SIC 55300 ("Recreational vehicle parks, trailer parks and
// camping grounds") — an official, open (OGL) index of UK campsite businesses.
// 1) Writes an active-company target list to companies-house-campsites.csv.
// 2) Cross-references names against our OSM campsites and reports the overlap
//    (informational — a corroborating "real operator" signal; not mutated in).
// Reads COMPANIES_HOUSE_API_KEY from .dev.vars.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const key = readFileSync(".dev.vars", "utf8").match(/COMPANIES_HOUSE_API_KEY=(.+)/)?.[1]?.trim();
if (!key) { console.error("No COMPANIES_HOUSE_API_KEY in .dev.vars"); process.exit(1); }
const auth = "Basic " + Buffer.from(key + ":").toString("base64");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(start) {
  const url = `https://api.company-information.service.gov.uk/advanced-search/companies` +
    `?sic_codes=55300&company_status=active&size=100&start_index=${start}`;
  for (let a = 0; a < 4; a++) {
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (res.status === 429) { await sleep(2000 * (a + 1)); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  throw new Error("rate-limited");
}

// ---- fetch all active pages (advanced-search caps at start_index 5000) ----
const companies = [];
let start = 0;
while (start < 5000) {
  let j;
  try { j = await page(start); }
  catch (e) { console.log(`  stopped at ${start} (${e.message}) — keeping ${companies.length}`); break; }
  const items = j.items || [];
  if (!items.length) break;
  for (const c of items) {
    const a = c.registered_office_address || {};
    companies.push({
      name: c.company_name || "",
      number: c.company_number || "",
      status: c.company_status || "",
      incorporated: c.date_of_creation || "",
      address: [a.address_line_1, a.address_line_2, a.locality].filter(Boolean).join(", "),
      postcode: a.postal_code || "",
    });
  }
  start += 100;
  if (start % 1000 === 0) console.log(`  fetched ${companies.length}…`);
  await sleep(150);
}
console.log(`Active SIC 55300 companies: ${companies.length}`);

// ---- write target CSV ----
const COLS = ["name", "number", "status", "incorporated", "address", "postcode"];
const cell = (v) => { const s = (v ?? "").toString(); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
writeFileSync("companies-house-campsites.csv",
  [COLS.join(","), ...companies.map((c) => COLS.map((k) => cell(c[k])).join(","))].join("\n") + "\n");
console.log("Wrote companies-house-campsites.csv");

// ---- cross-reference against OSM campsite names (informational) ----
const STOP = ["ltd", "limited", "llp", "the", "and", "caravan", "camping", "campsite", "camp",
  "park", "holiday", "holidays", "site", "leisure", "touring", "co", "company", "uk", "cc", "farm"];
const normTokens = (s) => new Set((s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ")
  .split(/\s+/).filter((w) => w.length > 2 && !STOP.includes(w)));
const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };

const dir = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const db = new DatabaseSync(`${dir}/${readdirSync(dir).find((f) => f.endsWith(".sqlite"))}`);
const osm = db.prepare("SELECT name FROM osm_places WHERE category IN ('camp_site','caravan_site') AND name IS NOT NULL").all()
  .map((r) => ({ name: r.name, tok: normTokens(r.name) }));
db.close();

const chTok = companies.map((c) => normTokens(c.name));
let matched = 0;
for (const o of osm) {
  if (chTok.some((t) => jaccard(o.tok, t) >= 0.6)) matched++;
}
console.log(`OSM campsites (${osm.length}) with a fuzzy CH name match: ${matched} (${(100 * matched / osm.length).toFixed(0)}%)`);
