-- Classify each stopover from its own website: is it a genuine tourist campsite,
-- or a residential/static "park home" estate we should exclude from the directory?
-- Populated by scripts/classify-local.mjs (and the refresh worker going forward).
ALTER TABLE place_geo ADD COLUMN site_type    TEXT;  -- tourist_campsite | residential_park | holiday_static | closed | unknown
ALTER TABLE place_geo ADD COLUMN site_checked TEXT;  -- ISO timestamp; set even on failure
