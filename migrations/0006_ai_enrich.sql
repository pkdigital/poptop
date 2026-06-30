-- AI-generated title/description (Claude Haiku), one-time, cached per place.
-- Our own content (no third-party licence). Stored in the per-place enrichment row.
ALTER TABLE place_geo ADD COLUMN ai_title   TEXT;
ALTER TABLE place_geo ADD COLUMN ai_desc    TEXT;
ALTER TABLE place_geo ADD COLUMN ai_checked TEXT;  -- ISO timestamp; set even on failure
