-- Community-contributed photos for any place (OSM or community), stored in R2.
CREATE TABLE IF NOT EXISTS place_photos (
  id         TEXT PRIMARY KEY,
  place_ref  TEXT NOT NULL,                       -- "osm/node/123" or "community/<uuid>"
  key        TEXT NOT NULL,                        -- R2 object key
  status     TEXT NOT NULL DEFAULT 'approved',     -- approved | pending | rejected
  submitter  TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_place_photos ON place_photos (place_ref, status, created_at);
