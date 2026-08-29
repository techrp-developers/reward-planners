-- Content Management (RP module) - Navbar / Promotional Banner / Offers Banner
-- One table, scoped by `module` so Service/Payment can reuse it later without a schema change.

CREATE TABLE IF NOT EXISTS content_zone_entries (
  content_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  module ENUM('product', 'service', 'payment') NOT NULL DEFAULT 'product',
  zone ENUM('navbar_background', 'promotional_banner', 'offers_banner') NOT NULL,
  content_type ENUM('color', 'image') NOT NULL DEFAULT 'color',
  color_value VARCHAR(500) NULL,
  image_url VARCHAR(255) NULL,
  title VARCHAR(150) NOT NULL,
  cta_text VARCHAR(60) NULL,
  redirect_link VARCHAR(255) NULL,
  start_at DATETIME NULL,
  end_at DATETIME NULL,
  priority SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  created_by_name VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (content_id),
  KEY idx_module_zone (module, zone),
  KEY idx_zone_window (module, zone, is_published, start_at, end_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed one Default row per zone (mirrors the frontend's un-deletable Default entries)
INSERT INTO content_zone_entries (module, zone, content_type, color_value, title, is_default, is_published)
VALUES
  ('product', 'navbar_background', 'color', '#852BAF', 'Default Navbar', 1, 1),
  ('product', 'promotional_banner', 'color', '#25103d', 'Default Promotional Banner', 1, 1),
  ('product', 'offers_banner', 'color', '#FC3F78', 'Default Offers Banner', 1, 1);
