-- Poptop schema.
--
-- IMPORTANT — ODbL containment:
-- `osm_places` is a DERIVATIVE DATABASE of OpenStreetMap and therefore carries
-- ODbL share-alike obligations. `community_listings` is our own proprietary
-- user-generated content. They are kept in SEPARATE tables on purpose (a
-- "collective database") so that the share-alike obligation does NOT bleed into
-- our community data. Never blend the two into one physical table. The app joins
-- them at query time only.

-- ---------------------------------------------------------------------------
-- OSM-derived layer: facilities + formal sites/aires. Refreshed from Overpass.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS osm_places (
  osm_id       TEXT PRIMARY KEY,          -- e.g. "node/123456" or "way/789"
  name         TEXT,
  category     TEXT NOT NULL,             -- caravan_site | camp_site | dump_station | drinking_water | water_point | other
  lat          REAL NOT NULL,
  lng          REAL NOT NULL,
  has_water    INTEGER NOT NULL DEFAULT 0,
  has_dump     INTEGER NOT NULL DEFAULT 0,
  has_toilets  INTEGER NOT NULL DEFAULT 0,
  fee          TEXT,                      -- raw OSM fee tag (yes/no/amount), nullable
  tags         TEXT,                      -- full original tag set as JSON (for re-deriving later)
  updated_at   TEXT NOT NULL             -- ISO timestamp of last sync
);

CREATE INDEX IF NOT EXISTS idx_osm_bbox     ON osm_places (lat, lng);
CREATE INDEX IF NOT EXISTS idx_osm_category ON osm_places (category);

-- ---------------------------------------------------------------------------
-- Community layer: pub stopovers, driveways, informal park-ups. OUR data.
-- This is the moat. AI moderation gates rows from 'pending' -> 'approved'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS community_listings (
  id           TEXT PRIMARY KEY,          -- uuid
  name         TEXT NOT NULL,
  type         TEXT NOT NULL,             -- pub | driveway | aire | site | other
  lat          REAL NOT NULL,
  lng          REAL NOT NULL,
  description  TEXT,
  facilities   TEXT,                      -- JSON: {water,dump,toilet,electric,...}
  contact      TEXT,                      -- optional public contact (phone/url)
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | flagged
  mod_score    REAL,                      -- AI moderation confidence
  mod_reason   TEXT,                      -- AI moderation explanation
  submitter    TEXT,                      -- email/handle, kept private
  created_at   TEXT NOT NULL,
  reviewed_at  TEXT
);

CREATE INDEX IF NOT EXISTS idx_comm_bbox   ON community_listings (lat, lng);
CREATE INDEX IF NOT EXISTS idx_comm_status ON community_listings (status);
CREATE INDEX IF NOT EXISTS idx_comm_type   ON community_listings (type);
