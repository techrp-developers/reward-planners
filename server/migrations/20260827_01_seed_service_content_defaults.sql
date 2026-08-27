-- Content Management: seed a Default navbar_background row for the 'service'
-- module now that its admin screen is live, mirroring the 'product' Default
-- row created in 20260819_01_create_content_zone_entries.sql so navbar_background
-- always resolves to something instead of null before an admin publishes a real entry.
--
-- promotional_banner and offers_banner do NOT get Default rows: the resolved
-- mobile endpoint only ever returns a live (non-default) campaign or null for
-- those two zones, so a Default row there would never be served and only
-- clutters the admin listing.

INSERT INTO content_zone_entries (module, zone, content_type, color_value, title, is_default, is_published)
SELECT 'service', 'navbar_background', 'color', '#852BAF', 'Default Navbar', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM content_zone_entries WHERE module = 'service' AND zone = 'navbar_background' AND is_default = 1
);
