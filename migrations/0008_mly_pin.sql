-- Pinned Mapillary image per place (chosen once, watermarked sources excluded),
-- so the photo is stable across renders. Resolved lazily by /api/streetview.
ALTER TABLE place_geo ADD COLUMN mly_id      TEXT;  -- chosen Mapillary image id (null = no usable image)
ALTER TABLE place_geo ADD COLUMN mly_checked TEXT;  -- ISO timestamp; set even when none found
