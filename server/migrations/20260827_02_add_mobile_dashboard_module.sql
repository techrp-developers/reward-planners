-- Content Management: add 'mobile_dashboard' as a supported module (navbar_background,
-- promotional_banner and offers_banner content for the app's main dashboard screen).
-- Widens the existing ENUM rather than replacing the column so existing rows are untouched.

ALTER TABLE content_zone_entries
  MODIFY COLUMN module ENUM('product', 'service', 'payment', 'dineout', 'mobile_dashboard') NOT NULL DEFAULT 'product';

-- Seed a Default navbar_background entry for mobile_dashboard, mirroring the other
-- modules' Default rows so GET /content/resolved/mobile_dashboard never returns null
-- for navbar_background before an admin creates a real one.
INSERT INTO content_zone_entries (module, zone, content_type, color_value, title, is_default, is_published)
SELECT 'mobile_dashboard', 'navbar_background', 'color', '#852BAF', 'Default Navbar', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM content_zone_entries WHERE module = 'mobile_dashboard' AND zone = 'navbar_background' AND is_default = 1
);

-- 'payment' has been a valid module since the table was created but never got its Default
-- navbar_background row (only product/service/dineout did) - the admin Payment screen now
-- being live means this was missing. Backfill it the same way.
INSERT INTO content_zone_entries (module, zone, content_type, color_value, title, is_default, is_published)
SELECT 'payment', 'navbar_background', 'color', '#852BAF', 'Default Navbar', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM content_zone_entries WHERE module = 'payment' AND zone = 'navbar_background' AND is_default = 1
);
