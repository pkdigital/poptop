// Dataset export helpers. Pulls the whole UK set once and renders to CSV / GPX.
// OSM-derived rows stay ODbL — exports carry attribution.

import { queryPlaces } from "./places.mjs";
import { kindLabel } from "./format.mjs";

export const EXPORT_ATTRIBUTION =
  "Data © OpenStreetMap contributors (ODbL) + Poptop community contributors";

// Unified, flat rows for tabular/waypoint formats.
export async function getAllPlaces(DB) {
  const data = await queryPlaces(DB, { n: 61, s: 49.5, e: 2.2, w: -9, limit: 40000 });

  const osm = data.osm.map((p) => ({
    source: "osm",
    id: p.id,
    name: p.name || kindLabel(p.kind),
    kind: p.kind,
    lat: p.lat,
    lng: p.lng,
    water: p.has_water ? 1 : 0,
    waste: p.has_dump ? 1 : 0,
    toilets: p.has_toilets ? 1 : 0,
  }));

  const comm = data.community.map((p) => {
    let f = {};
    try { f = p.facilities ? JSON.parse(p.facilities) : {}; } catch {}
    return {
      source: "community",
      id: p.id,
      name: p.name || kindLabel(p.kind),
      kind: p.kind,
      lat: p.lat,
      lng: p.lng,
      water: f.water ? 1 : 0,
      waste: f.waste || f.dump ? 1 : 0,
      toilets: f.toilet || f.toilets ? 1 : 0,
    };
  });

  return [...comm, ...osm];
}

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(rows) {
  const cols = ["source", "id", "name", "kind", "lat", "lng", "water", "waste", "toilets"];
  const lines = [
    `# ${EXPORT_ATTRIBUTION}`,
    cols.join(","),
    ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(",")),
  ];
  return lines.join("\n") + "\n";
}

const xml = (s) =>
  String(s ?? "").replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c])
  );

export function toGPX(rows) {
  const wpts = rows
    .map(
      (r) =>
        `  <wpt lat="${r.lat}" lon="${r.lng}">\n` +
        `    <name>${xml(r.name)}</name>\n` +
        `    <desc>${xml(kindLabel(r.kind))}</desc>\n` +
        `    <type>${xml(r.kind)}</type>\n` +
        `  </wpt>`
    )
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="Poptop" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `  <metadata><name>Poptop UK stopovers</name><desc>${EXPORT_ATTRIBUTION}</desc></metadata>\n` +
    wpts +
    `\n</gpx>\n`
  );
}
