# Poptop

A UK-first reference for campervan/motorhome travellers to find **stopovers** (sites,
pub stopovers, private driveways) and **refill facilities** (water, toilet/Elsan
emptying). SEO-first, mobile-first, runs on Cloudflare for ~£0/month, self-moderated by AI.

## Architecture

Two Cloudflare Workers sharing one D1 — serving and ingest kept separate:

- **Astro app** (root, `src/pages/`) — serves all request traffic: SEO pages + JSON API.
- **Refresh worker** (`workers/refresh/`) — monthly cron that re-pulls OSM into D1.

### What exists today

Data layer:
- **`migrations/0001_init.sql`** — D1 schema. Two physically separate tables on purpose:
  - `osm_places` — facilities + formal sites/aires, derived from OpenStreetMap.
  - `community_listings` — our own pub/driveway/park-up data (the moat), AI-moderated.
- **`src/lib/overpass.mjs`** — UK Overpass query + normaliser + resilient fetcher (mirror fallback + backoff).
- **`src/lib/places.mjs`** — shared bbox read query (OSM + approved community).
- **`src/lib/refresh.mjs`** — batched OSM upsert. **`scripts/seed.mjs`** — local seeder → `seed-osm.sql`.

Frontend (Astro on Cloudflare, SSR from D1):
- **`/`** — clustered MapLibre map (Positron tiles, clusters coloured by dominant facility type) + crawlable town links.
- **`/api/places`** / **`/api/places.geojson`** — bbox JSON + clustered GeoJSON the map calls.
- **`/motorhome-stopovers/[town]`** — programmatic SEO pages (one per `src/data/towns.mjs` row),
  server-rendered with schema.org `ItemList`/`Campground` markup. **This is the traffic engine.**
- **`/place/[...slug]`** — per-location detail page (`osm/node/123` or `community/<uuid>`): name,
  static mini-map, "is this still here?" 👍/👎 vote, reviews, address, what3words, coords, directions,
  schema.org `LocalBusiness`/`Campground` + `AggregateRating`.
- **`/sitemap.xml`**, **`public/robots.txt`** — discoverability.

Engagement layer (migration `0002`): `place_feedback` (votes) + `reviews` (moderated).
APIs: `POST /api/feedback`, `POST /api/reviews` (stored `pending` → AI moderation hooks in here next).

External services: address via [postcodes.io](https://postcodes.io) (free, UK, no key).
what3words needs a `W3W_API_KEY` secret — degrades gracefully (hidden) when absent.

Verified end-to-end against live Overpass + local D1: **~11,800 UK places on day one**
(4.7k caravan sites, 3.9k camp sites, 2.3k drinking water, 540 water points, 333 dump stations).
e.g. the Keswick page renders 85 nearby listings.

> Note: the CF adapter prints an informational `SESSION` KV binding warning. Harmless until
> Astro sessions are used; add a KV namespace binding then.

## ⚠️ Licensing — do not break this

OSM data is **ODbL** (share-alike on the *derivative database*). `osm_places` and
`community_listings` are kept separate so the obligation does NOT extend to our
community data. **Never merge them into one table.** Show "© OpenStreetMap contributors"
on every map (the API already returns it in `attribution`).

## Setup

```bash
npm install
npm run db:create          # creates poptop-db, paste the database_id into both wrangler.jsonc files
npm run db:migrate:local   # apply schema locally
npm run seed:fetch         # pull UK extract from Overpass -> scripts/seed-osm.sql (already generated)
npm run seed:local         # load it into local D1
npm run dev                # http://127.0.0.1:4321/  (map) and /motorhome-stopovers/keswick
```

Swap `:local` for `:remote` (and `db:migrate:remote`) to do the same against the live D1.
Deploy: `npm run deploy` (Astro app) and `npm run deploy:refresh` (cron worker).

## Roadmap

1. ~~Frontend — Astro + MapLibre + free tiles~~ ✅
2. ~~Programmatic SEO town pages with schema markup~~ ✅ (town pages; **location detail pages still TODO**)
3. **Submission flow + AI moderation** — form → Workers AI gates `community_listings`
   pending → approved (spam/abuse/PII/relevance + photo moderation). Grows the moat.
4. **Per-location detail pages** (`/stopover/[id]`) — deeper long-tail SEO + review schema.
5. **Address autocomplete** on the submission form — postcodes.io (UK, free) / Geoapify; avoid Google billing.
6. **Expand town list / auto-generate** town & facility (`/water-refill/[area]`) pages.
7. Later: Europe + i18n.
