import { moderateListing } from "../../lib/moderation.mjs";
import { autosuggestW3w } from "../../lib/geo.mjs";

export const prerender = false;

const TYPES = ["pub", "driveway", "aire", "site", "other"];
const inUK = (lat, lng) => lat >= 49 && lat <= 61 && lng >= -9 && lng <= 2.2;

// POST a community listing -> moderated -> stored.
export async function POST({ request, locals }) {
  const env = locals.runtime.env;
  let b;
  try { b = await request.json(); } catch { b = {}; }

  const name = String(b.name || "").trim();
  const type = String(b.type || "").trim();
  const description = String(b.description || "").trim();
  const contact = String(b.contact || "").trim().slice(0, 200) || null;
  const submitter = String(b.submitter || "").trim().slice(0, 120) || null;
  const w3wInput = String(b.w3w || "").trim();
  const lat = Number(b.lat);
  const lng = Number(b.lng);

  // Validation
  if (name.length < 3 || name.length > 120) {
    return Response.json({ error: "Please give the place a name (3–120 chars)." }, { status: 400 });
  }
  if (!TYPES.includes(type)) {
    return Response.json({ error: "Pick a valid type." }, { status: 400 });
  }
  if (Number.isNaN(lat) || Number.isNaN(lng) || !inUK(lat, lng)) {
    return Response.json({ error: "Drop a pin on the map (UK only for now)." }, { status: 400 });
  }
  if (description.length > 2000) {
    return Response.json({ error: "Description too long (2000 char max)." }, { status: 400 });
  }

  // Facilities: keep only known boolean flags.
  const f = b.facilities && typeof b.facilities === "object" ? b.facilities : {};
  const facilities = JSON.stringify({
    water: !!f.water, waste: !!f.waste, toilets: !!f.toilets, electric: !!f.electric,
  });

  // Moderate
  const verdict = await moderateListing(env, { name, type, description });
  if (verdict.status === "rejected") {
    return Response.json({ ok: false, status: "rejected", reason: verdict.reason }, { status: 200 });
  }

  // Store
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const reviewedAt = verdict.status === "approved" ? now : null;
  await env.DB.prepare(
    `INSERT INTO community_listings` +
      ` (id, name, type, lat, lng, description, facilities, contact, status, mod_score, mod_reason, submitter, created_at, reviewed_at)` +
      ` VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, name, type, lat, lng, description || null, facilities, contact,
      verdict.status, verdict.score, verdict.reason, submitter, now, reviewedAt)
    .run();

  // Optional what3words: validate via free AutoSuggest, cache for the detail page.
  if (w3wInput) {
    const words = await autosuggestW3w(w3wInput, env.W3W_API_KEY, { focusLat: lat, focusLng: lng });
    if (words) {
      await env.DB.prepare(
        `INSERT INTO place_geo (place_ref, w3w, cached_at) VALUES (?, ?, ?)` +
          ` ON CONFLICT(place_ref) DO UPDATE SET w3w = excluded.w3w`
      ).bind(`community/${id}`, words, now).run();
    }
  }

  return Response.json({ ok: true, id, status: verdict.status });
}
