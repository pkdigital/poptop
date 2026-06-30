-- Cache a place's website preview image (Open Graph). We store only the resolved
-- URL (hotlinked via the page), not the bytes. og_status flags the outcome so we
-- don't re-resolve constantly and can surface broken/missing ones.
ALTER TABLE place_geo ADD COLUMN og_image  TEXT;   -- validated image URL, or null
ALTER TABLE place_geo ADD COLUMN og_status TEXT;   -- ok | no_image | broken | error
ALTER TABLE place_geo ADD COLUMN og_checked TEXT;  -- ISO timestamp of last attempt
