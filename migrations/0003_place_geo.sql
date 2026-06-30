-- Cache of external geo lookups (postcodes.io address + what3words) per place.
-- These never change for a fixed coordinate, so we fetch once and reuse —
-- keeps us well within the what3words free-tier conversion quota.
CREATE TABLE IF NOT EXISTS place_geo (
  place_ref  TEXT PRIMARY KEY,   -- "osm/node/123" or "community/<uuid>"
  postcode   TEXT,
  district   TEXT,
  region     TEXT,
  w3w        TEXT,               -- "filled.count.soap" (no leading ///)
  cached_at  TEXT NOT NULL
);
