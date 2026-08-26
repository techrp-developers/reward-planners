-- Content Management: CMS-driven top-navbar module icons (Product/Services/
-- Payments/DineOut). One row per module; icon_url/active_icon_url start blank
-- until an admin uploads real assets through the CMS.

CREATE TABLE IF NOT EXISTS module_icons (
  icon_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  module VARCHAR(50) NOT NULL,
  icon_type ENUM('image', 'svg') NOT NULL DEFAULT 'image',
  icon_url VARCHAR(500) NOT NULL,
  active_icon_url VARCHAR(500) DEFAULT NULL,
  label VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_name VARCHAR(255) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (icon_id),
  UNIQUE KEY uq_module_icons_module (module),
  INDEX idx_module_icons_active_sort (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Seed one row per module, mirroring content_zone_entries' idempotent seed pattern.
INSERT INTO module_icons (module, icon_type, icon_url, label, sort_order, is_active)
SELECT 'product', 'image', '', 'Product', 0, 1
WHERE NOT EXISTS (SELECT 1 FROM module_icons WHERE module = 'product');

INSERT INTO module_icons (module, icon_type, icon_url, label, sort_order, is_active)
SELECT 'service', 'image', '', 'Services', 1, 1
WHERE NOT EXISTS (SELECT 1 FROM module_icons WHERE module = 'service');

INSERT INTO module_icons (module, icon_type, icon_url, label, sort_order, is_active)
SELECT 'payment', 'image', '', 'Payments', 2, 1
WHERE NOT EXISTS (SELECT 1 FROM module_icons WHERE module = 'payment');

INSERT INTO module_icons (module, icon_type, icon_url, label, sort_order, is_active)
SELECT 'dineout', 'image', '', 'Bus Booking', 3, 1
WHERE NOT EXISTS (SELECT 1 FROM module_icons WHERE module = 'dineout');
