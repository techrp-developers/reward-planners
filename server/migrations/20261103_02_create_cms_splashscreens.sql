-- Dynamic splash screens and page campaigns, built on the existing CMS.
-- Additive and safe to run more than once: creates two tables, changes no
-- existing table or row. Artwork, title, link, schedule, priority and
-- publication stay in content_zone_entries / content_zone_entry_images.
-- Verify with: node scripts/verify-splashscreen-schema.js

-- Where a CMS entry is shown in the app. One entry can be placed on several
-- pages/slots without being duplicated. Removing the entry removes its
-- placements.
CREATE TABLE IF NOT EXISTS cms_splashscreen_placements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  content_id BIGINT UNSIGNED NOT NULL,
  page_key VARCHAR(64) NOT NULL,
  slot_key VARCHAR(64) NOT NULL,
  platform ENUM('all', 'android', 'ios') NOT NULL DEFAULT 'all',
  audience ENUM('all', 'authenticated', 'guest') NOT NULL DEFAULT 'all',
  frequency_rule ENUM('once_per_session', 'once_per_day', 'every_visit') NOT NULL DEFAULT 'once_per_day',
  -- NULL means the documented default (3 s for splash/popup slots).
  display_seconds SMALLINT UNSIGNED NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_campaign_placement (content_id, page_key, slot_key, platform, audience),
  KEY idx_screen_lookup (page_key, slot_key, is_enabled),
  CONSTRAINT fk_screen_placement_content FOREIGN KEY (content_id)
    REFERENCES content_zone_entries (content_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- What a page/slot shows when no scheduled campaign is live. A platform
-- specific row wins over 'all'. Deleting the default entry clears the link,
-- and the slot then shows nothing.
CREATE TABLE IF NOT EXISTS cms_splashscreen_defaults (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  page_key VARCHAR(64) NOT NULL,
  slot_key VARCHAR(64) NOT NULL,
  platform ENUM('all', 'android', 'ios') NOT NULL DEFAULT 'all',
  fallback_policy ENUM('show_content', 'skip') NOT NULL DEFAULT 'skip',
  default_content_id BIGINT UNSIGNED NULL,
  UNIQUE KEY uq_screen_default (page_key, slot_key, platform),
  KEY fk_screen_default_content (default_content_id),
  CONSTRAINT fk_screen_default_content FOREIGN KEY (default_content_id)
    REFERENCES content_zone_entries (content_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
