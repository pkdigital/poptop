// Human labels + helpers shared across pages.

export const KIND_LABELS = {
  caravan_site: "Caravan site",
  camp_site: "Campsite",
  dump_station: "Waste / Elsan disposal",
  drinking_water: "Drinking water",
  water_point: "Water point",
  motorhome_parking: "Motorhome parking",
  lpg: "LPG / autogas",
  toilets: "Public toilets",
  pub: "Pub stopover",
  driveway: "Private driveway",
  aire: "Aire",
  site: "Site",
  other: "Other",
};

export const kindLabel = (k) => KIND_LABELS[k] || "Stopover";

// Themed tile colour + icon name (icons.mjs key) per category — used wherever a
// place has no photo. Matches the map marker colours.
export function kindVisual(kind, source) {
  if (source === "community") return { color: "#ff385c", icon: kind === "pub" ? "beer" : "house" };
  if (kind === "drinking_water" || kind === "water_point") return { color: "#0ea5e9", icon: "droplet" };
  if (kind === "dump_station") return { color: "#f97316", icon: "recycle" };
  if (kind === "toilets") return { color: "#0891b2", icon: "toilet" };
  if (kind === "lpg") return { color: "#7c3aed", icon: "zap" };
  if (kind === "motorhome_parking") return { color: "#16a34a", icon: "caravan" };
  return { color: "#16a34a", icon: "tent" };
}

// Rough straight-line distance for sorting/labelling (miles). Fine at town scale.
export function distanceMiles(aLat, aLng, bLat, bLng) {
  const R = 3958.8;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const la1 = (aLat * Math.PI) / 180;
  const la2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}

// Returns [{ icon, label }] — icon is a key in src/lib/icons.mjs.
export function facilityBadges(p) {
  const out = [];
  if (p.has_water || p.kind === "drinking_water" || p.kind === "water_point") out.push({ icon: "droplet", label: "Water" });
  if (p.has_dump || p.kind === "dump_station") out.push({ icon: "recycle", label: "Waste disposal" });
  if (p.has_toilets) out.push({ icon: "toilet", label: "Toilets" });
  if (p.fee === "no") out.push({ icon: "shield", label: "Free" });
  return out;
}
