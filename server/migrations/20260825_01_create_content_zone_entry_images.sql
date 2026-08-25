-- Content Management: multi-image support for Offers Banner campaigns.
-- One content_zone_entries row (module=product, zone=offers_banner) can now
-- own an ordered set of images instead of a single image_url. Other zones
-- (navbar_background, promotional_banner) keep using image_url as-is.

CREATE TABLE IF NOT EXISTS content_zone_entry_images (
  image_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  content_id INT UNSIGNED NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (image_id),
  KEY idx_content_id (content_id),
  KEY idx_content_sort (content_id, sort_order),
  CONSTRAINT fk_content_zone_entry_images_entry
    FOREIGN KEY (content_id)
    REFERENCES content_zone_entries (content_id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
