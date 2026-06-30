-- Website preview text (Open Graph), captured in the same fetch as og_image.
-- Free Tier-0 descriptions for places that have a website.
ALTER TABLE place_geo ADD COLUMN og_title TEXT;
ALTER TABLE place_geo ADD COLUMN og_desc  TEXT;
