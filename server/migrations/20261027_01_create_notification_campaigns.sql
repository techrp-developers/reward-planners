-- =====================================================================
-- Reward Planners - Push Notification Manager: campaign tables
-- Step 2 of 3. Run after 20261026_02, before 20261028_01.
--
-- PROPOSAL: review before running. Additive only: creates four new tables
-- and never alters, truncates or deletes existing tables or rows.
-- Safe to re-run: every statement is CREATE TABLE IF NOT EXISTS.
--
-- Compatible with MariaDB 10.2+ (tested target: 10.4.32) and MySQL 5.7+.
-- JSON columns: MariaDB stores them as LONGTEXT with an automatic
-- JSON_VALID check; MySQL stores native JSON. Invalid JSON is rejected on
-- both, so no explicit CHECK constraints are needed.
--
-- The existing `campaigns` table belongs to e-commerce banners and is
-- not used. All schedule instants (scheduled_at, next_run_at, expires_at,
-- locked_until, next_attempt_at) are written in UTC by the backend.
--
-- Rich-image columns (content_type, destination_*, catalog_product_ids,
-- media, image_fallback) are included here, so a fresh install needs no
-- ALTER. 20261028_01 only adds them to a campaign table created earlier.
-- =====================================================================


-- RM -> company scope. Until rows exist, an RM can send to test users only.
-- rm_user_id = eusers.user_id (role 'rm'); company_id = companies.company_id;
-- assigned_by = eusers.user_id of the admin who assigned it.
CREATE TABLE IF NOT EXISTS rm_company_assignments (
  rm_user_id INT NOT NULL,
  company_id INT NOT NULL,
  assigned_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rm_user_id, company_id),
  KEY idx_rm_company_assignments_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- One row per campaign.
-- announcement_type:  required when category = 'announcement' (company_update,
--                     hr_policy, event, service_disruption, system_maintenance,
--                     safety_notice); promotions must use marketing/engagement.
-- client_request_id:  one id per dashboard compose session. The UNIQUE key
--                     (created_by, client_request_id) makes repeated or
--                     concurrent "create" clicks return the same campaign.
--                     NULL values never collide, so API calls without it work.
-- approved_languages: comma list of reviewed translations, e.g. 'hi,mr'.
-- variables:          JSON object of campaign-wide placeholder values.
-- audience_filter:    JSON {"user_ids":[], "company_ids":[], "module":null}.
-- destination_type:   key from app/common/utils/notificationDestinations.js.
-- catalog_product_ids: JSON array of eproducts.product_id.
-- media:              JSON {"default": media_id, "en": .., "hi": .., "mr": ..}
--                     referencing notification_media.media_id.
CREATE TABLE IF NOT EXISTS notification_campaigns (
  campaign_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  source ENUM('template', 'manual') NOT NULL,
  template_id BIGINT UNSIGNED NULL,
  module VARCHAR(30) NOT NULL,
  category ENUM('marketing', 'engagement', 'announcement') NOT NULL,
  announcement_type VARCHAR(40) NULL,
  content_type ENUM('standard', 'image', 'catalog') NOT NULL DEFAULT 'standard',
  priority ENUM('low', 'normal', 'high') NOT NULL DEFAULT 'normal',
  title_en VARCHAR(255) NOT NULL,
  body_en TEXT NOT NULL,
  title_hi VARCHAR(255) NULL,
  body_hi TEXT NULL,
  title_mr VARCHAR(255) NULL,
  body_mr TEXT NULL,
  approved_languages VARCHAR(20) NOT NULL DEFAULT '',
  variables JSON NULL,
  target_screen VARCHAR(60) NULL,
  destination_type VARCHAR(40) NULL,
  destination_id VARCHAR(64) NULL,
  catalog_product_ids JSON NULL,
  reference_type VARCHAR(30) NULL,
  reference_id VARCHAR(64) NULL,
  image_url VARCHAR(500) NULL,
  media JSON NULL,
  audience_type ENUM('test', 'individual', 'selected', 'company', 'assigned_companies', 'module_users', 'all_companies') NOT NULL DEFAULT 'test',
  audience_filter JSON NULL,
  delivery_mode ENUM('now', 'once', 'recurring') NOT NULL DEFAULT 'once',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  scheduled_at DATETIME NULL,
  recurrence_type ENUM('none', 'daily', 'weekly', 'monthly') NOT NULL DEFAULT 'none',
  recurrence_end_at DATETIME NULL,
  max_occurrences INT UNSIGNED NULL,
  expires_at DATETIME NULL,
  next_run_at DATETIME NULL,
  occurrences_started INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('draft', 'pending_approval', 'approved', 'rejected', 'scheduled', 'sending', 'completed', 'partially_failed', 'failed', 'cancelled', 'expired') NOT NULL DEFAULT 'draft',
  estimated_recipients INT UNSIGNED NULL,
  created_by INT NOT NULL,
  created_by_role VARCHAR(30) NOT NULL,
  updated_by INT NULL,
  submitted_at DATETIME NULL,
  approved_by INT NULL,
  approved_at DATETIME NULL,
  rejection_reason VARCHAR(500) NULL,
  cancelled_by INT NULL,
  cancelled_at DATETIME NULL,
  locked_until DATETIME NULL,
  lock_token CHAR(36) NULL,
  client_request_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id),
  UNIQUE KEY uq_campaign_client_request (created_by, client_request_id),
  KEY idx_notification_campaigns_due (status, next_run_at),
  KEY idx_notification_campaigns_creator (created_by, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Per-recipient delivery job; this table is the database-backed send queue
-- (no separate notification_delivery_jobs table is used by the backend).
-- status: pending/processing = queued; sent = Firebase accepted for >= 1
-- device; inbox_only = inbox row created but no registered device;
-- failed = push failed on every device; skipped = consent/quiet hours/limit.
-- The unique key makes audience materialisation idempotent across worker
-- restarts. The matching notifications row uses the idempotency key
-- campaign:<id>:<occurrence>:<user>, so retries never add a second inbox row.
CREATE TABLE IF NOT EXISTS notification_campaign_recipients (
  recipient_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id BIGINT UNSIGNED NOT NULL,
  occurrence_no INT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  language ENUM('en', 'hi', 'mr') NOT NULL DEFAULT 'en',
  status ENUM('pending', 'processing', 'sent', 'inbox_only', 'failed', 'skipped', 'cancelled') NOT NULL DEFAULT 'pending',
  skip_reason VARCHAR(60) NULL,
  notification_id INT NULL,
  devices_attempted TINYINT UNSIGNED NOT NULL DEFAULT 0,
  devices_accepted TINYINT UNSIGNED NOT NULL DEFAULT 0,
  image_fallback TINYINT(1) NOT NULL DEFAULT 0,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NULL,
  locked_until DATETIME NULL,
  lock_token CHAR(36) NULL,
  last_error_code VARCHAR(100) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (recipient_id),
  UNIQUE KEY uq_campaign_recipient (campaign_id, occurrence_no, user_id),
  KEY idx_campaign_recipients_due (status, next_attempt_at),
  KEY idx_campaign_recipients_lock (lock_token),
  KEY idx_campaign_recipients_campaign_status (campaign_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Every campaign action and every denied authorisation decision.
-- campaign_id is NULL for template/media actions. details = JSON object.
CREATE TABLE IF NOT EXISTS notification_campaign_audit_logs (
  audit_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id BIGINT UNSIGNED NULL,
  actor_user_id INT NOT NULL,
  actor_role VARCHAR(30) NOT NULL,
  action VARCHAR(40) NOT NULL,
  decision ENUM('allowed', 'denied') NOT NULL DEFAULT 'allowed',
  details JSON NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (audit_id),
  KEY idx_campaign_audit_campaign (campaign_id, created_at),
  KEY idx_campaign_audit_actor (actor_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Intentionally no FOREIGN KEY constraints: the new tables reference
-- existing tables (eusers, customer, companies, notifications) whose rows
-- must never be locked, cascaded or blocked by campaign data.
