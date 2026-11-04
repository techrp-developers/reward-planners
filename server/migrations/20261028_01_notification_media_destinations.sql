-- =====================================================================
-- Reward Planners - Push Notification Manager: rich images & destinations
-- Step 3 of 3. Run after 20261027_01_create_notification_campaigns.sql.
--
-- PROPOSAL: review before running. Additive only; no existing row is
-- changed. Safe to re-run and safe on a partially applied schema:
--   * tables use CREATE TABLE IF NOT EXISTS
--   * columns are added only if the table exists and the column is missing,
--     checked through information_schema (works on MariaDB and MySQL; no
--     ADD COLUMN IF NOT EXISTS, no DELIMITER, no stored procedures)
--
-- On a fresh install 20261027_01 already creates every column below, so
-- each conditional step reports "skipped". The steps only matter when the
-- campaign tables were created from an older version of 20261027_01.
--
-- Run the whole file in phpMyAdmin's SQL tab. Each step returns one small
-- result row (migration_step) saying whether it ran or was skipped.
-- =====================================================================


-- 1. Notification image library (already present on rewardplanners_db;
--    unchanged if it exists). Assets are re-encoded by the backend to
--    1200x600 JPEG on the Reward Planners CDN.
CREATE TABLE IF NOT EXISTS notification_media (
  media_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source ENUM('upload', 'product', 'service', 'service_banner', 'category') NOT NULL,
  source_ref_id VARCHAR(64) NULL,
  label VARCHAR(150) NULL,
  language ENUM('en', 'hi', 'mr') NULL,
  storage_key VARCHAR(500) NOT NULL,
  public_url VARCHAR(600) NOT NULL,
  mime_type VARCHAR(40) NOT NULL,
  width SMALLINT UNSIGNED NOT NULL,
  height SMALLINT UNSIGNED NOT NULL,
  bytes INT UNSIGNED NOT NULL,
  status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  created_by INT NOT NULL,
  created_by_role VARCHAR(30) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (media_id),
  KEY idx_notification_media_source (source, source_ref_id),
  KEY idx_notification_media_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 2. Push taps reported by the app (POST /v1/notification/:id/opened).
--    Already present on rewardplanners_db; unchanged if it exists.
CREATE TABLE IF NOT EXISTS notification_open_events (
  open_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  notification_id INT NOT NULL,
  user_id INT NOT NULL,
  campaign_id BIGINT UNSIGNED NULL,
  app_state ENUM('foreground', 'background', 'terminated', 'inbox') NULL,
  outcome ENUM('opened_target', 'fallback', 'login_required') NOT NULL DEFAULT 'opened_target',
  destination_type VARCHAR(40) NULL,
  opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (open_id),
  UNIQUE KEY uq_notification_open (notification_id),
  KEY idx_notification_open_campaign (campaign_id, opened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 3. Rich columns on notification_campaigns (only if missing).

-- 3a. content_type
SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaigns') = 0,
  'SELECT ''notification_campaigns missing: run 20261027_01 first'' AS migration_step',
  IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaigns' AND COLUMN_NAME = 'content_type') > 0,
    'SELECT ''notification_campaigns.content_type already exists: skipped'' AS migration_step',
    'ALTER TABLE notification_campaigns ADD COLUMN content_type ENUM(''standard'', ''image'', ''catalog'') NOT NULL DEFAULT ''standard'''
  )
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

-- 3b. destination_type (key from notificationDestinations.js)
SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaigns') = 0,
  'SELECT ''notification_campaigns missing: run 20261027_01 first'' AS migration_step',
  IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaigns' AND COLUMN_NAME = 'destination_type') > 0,
    'SELECT ''notification_campaigns.destination_type already exists: skipped'' AS migration_step',
    'ALTER TABLE notification_campaigns ADD COLUMN destination_type VARCHAR(40) NULL'
  )
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

-- 3c. destination_id
SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaigns') = 0,
  'SELECT ''notification_campaigns missing: run 20261027_01 first'' AS migration_step',
  IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaigns' AND COLUMN_NAME = 'destination_id') > 0,
    'SELECT ''notification_campaigns.destination_id already exists: skipped'' AS migration_step',
    'ALTER TABLE notification_campaigns ADD COLUMN destination_id VARCHAR(64) NULL'
  )
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

-- 3d. catalog_product_ids: JSON array of eproducts.product_id
--     (JSON type keeps validation: MariaDB adds JSON_VALID automatically).
SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaigns') = 0,
  'SELECT ''notification_campaigns missing: run 20261027_01 first'' AS migration_step',
  IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaigns' AND COLUMN_NAME = 'catalog_product_ids') > 0,
    'SELECT ''notification_campaigns.catalog_product_ids already exists: skipped'' AS migration_step',
    'ALTER TABLE notification_campaigns ADD COLUMN catalog_product_ids JSON NULL'
  )
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

-- 3e. media: JSON {"default": media_id, "en": .., "hi": .., "mr": ..}
SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaigns') = 0,
  'SELECT ''notification_campaigns missing: run 20261027_01 first'' AS migration_step',
  IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaigns' AND COLUMN_NAME = 'media') > 0,
    'SELECT ''notification_campaigns.media already exists: skipped'' AS migration_step',
    'ALTER TABLE notification_campaigns ADD COLUMN media JSON NULL'
  )
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;


-- 4. Image fallback flag on notification_campaign_recipients (only if missing).
SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaign_recipients') = 0,
  'SELECT ''notification_campaign_recipients missing: run 20261027_01 first'' AS migration_step',
  IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaign_recipients' AND COLUMN_NAME = 'image_fallback') > 0,
    'SELECT ''notification_campaign_recipients.image_fallback already exists: skipped'' AS migration_step',
    'ALTER TABLE notification_campaign_recipients ADD COLUMN image_fallback TINYINT(1) NOT NULL DEFAULT 0'
  )
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;


-- 5. Announcement type on campaigns (only if missing). Announcements skip
--    marketing consent, so the backend requires an approved type.
SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaigns') = 0,
  'SELECT ''notification_campaigns missing: run 20261027_01 first'' AS migration_step',
  IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaigns' AND COLUMN_NAME = 'announcement_type') > 0,
    'SELECT ''notification_campaigns.announcement_type already exists: skipped'' AS migration_step',
    'ALTER TABLE notification_campaigns ADD COLUMN announcement_type VARCHAR(40) NULL'
  )
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

-- 6. client_request_id on campaigns (only if missing).
SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaigns') = 0,
  'SELECT ''notification_campaigns missing: run 20261027_01 first'' AS migration_step',
  IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaigns' AND COLUMN_NAME = 'client_request_id') > 0,
    'SELECT ''notification_campaigns.client_request_id already exists: skipped'' AS migration_step',
    'ALTER TABLE notification_campaigns ADD COLUMN client_request_id VARCHAR(64) NULL'
  )
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

-- 7. Durable duplicate-click protection: UNIQUE (created_by, client_request_id).
--    NULL client_request_id values never collide.
SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaigns' AND COLUMN_NAME = 'client_request_id') = 0,
  'SELECT ''notification_campaigns.client_request_id missing: skipped unique key'' AS migration_step',
  IF(
    (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaigns' AND INDEX_NAME = 'uq_campaign_client_request') > 0,
    'SELECT ''uq_campaign_client_request already exists: skipped'' AS migration_step',
    'ALTER TABLE notification_campaigns ADD UNIQUE KEY uq_campaign_client_request (created_by, client_request_id)'
  )
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

-- 8. Recipient status 'inbox_only' (inbox row created, no registered device).
--    Adding an ENUM value keeps every existing value and row.
SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaign_recipients') = 0,
  'SELECT ''notification_campaign_recipients missing: run 20261027_01 first'' AS migration_step',
  IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaign_recipients' AND COLUMN_NAME = 'status' AND COLUMN_TYPE LIKE '%inbox_only%') > 0,
    'SELECT ''notification_campaign_recipients.status already has inbox_only: skipped'' AS migration_step',
    'ALTER TABLE notification_campaign_recipients MODIFY COLUMN status ENUM(''pending'', ''processing'', ''sent'', ''inbox_only'', ''failed'', ''skipped'', ''cancelled'') NOT NULL DEFAULT ''pending'''
  )
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

-- 9. Template ownership: lets an RM publish and reuse the marketing/engagement
--    templates they created. Existing rows stay NULL (system templates remain
--    admin-managed). No template content is changed.
SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_templates') = 0,
  'SELECT ''notification_templates missing: skipped'' AS migration_step',
  IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_templates' AND COLUMN_NAME = 'created_by') > 0,
    'SELECT ''notification_templates.created_by already exists: skipped'' AS migration_step',
    'ALTER TABLE notification_templates ADD COLUMN created_by INT NULL'
  )
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

-- 10. Firebase project per device: devices still on the previous Firebase
--     project are routed there directly instead of failing on the new one.
--     Existing tokens are kept unchanged (NULL until a send succeeds).
SET @ddl = IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_push_tokens') = 0,
  'SELECT ''user_push_tokens missing: skipped'' AS migration_step',
  IF(
    (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_push_tokens' AND COLUMN_NAME = 'firebase_project_id') > 0,
    'SELECT ''user_push_tokens.firebase_project_id already exists: skipped'' AS migration_step',
    'ALTER TABLE user_push_tokens ADD COLUMN firebase_project_id VARCHAR(100) NULL'
  )
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;
