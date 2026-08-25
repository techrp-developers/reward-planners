-- Content Management: add 'dineout' as a supported module (navbar_background
-- content for the React Native app's DineOut tab). Widens the existing ENUM
-- rather than replacing the column so existing rows are untouched.

ALTER TABLE content_zone_entries
  MODIFY COLUMN module ENUM('product', 'service', 'payment', 'dineout') NOT NULL DEFAULT 'product';

-- Seed a Default navbar_background entry for dineout, mirroring the other
-- modules' Default rows so GET /content/resolved/navbar never returns null
-- for dineout before an admin creates a real one.
INSERT INTO content_zone_entries (module, zone, content_type, color_value, title, is_default, is_published)
SELECT 'dineout', 'navbar_background', 'color', '#852BAF', 'Default DineOut Navbar', 1, 1
WHERE NOT EXISTS (
  SELECT 1 FROM content_zone_entries WHERE module = 'dineout' AND zone = 'navbar_background' AND is_default = 1
);
