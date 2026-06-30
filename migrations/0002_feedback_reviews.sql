-- Engagement layer for place detail pages. `place_ref` is the unified key
-- "osm/node/123" or "community/<uuid>" — works across both data sources.

-- "Is this still here / correct?" thumbs up/down, aggregated per place.
CREATE TABLE IF NOT EXISTS place_feedback (
  place_ref   TEXT PRIMARY KEY,
  up          INTEGER NOT NULL DEFAULT 0,
  down        INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT
);

-- Reviews / comments. Moderated (AI) before they appear publicly.
CREATE TABLE IF NOT EXISTS reviews (
  id          TEXT PRIMARY KEY,
  place_ref   TEXT NOT NULL,
  author      TEXT,
  body        TEXT NOT NULL,
  rating      INTEGER,                          -- optional 1-5
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  mod_reason  TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reviews_place ON reviews (place_ref, status, created_at);
