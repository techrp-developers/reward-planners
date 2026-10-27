-- PROPOSAL: review before running. Additive only; no existing table is changed.
-- Requires 20261026_02_create_notification_push_attempts.sql for attempt logs
-- (the campaign manager works without it but cannot show per-device results).
--
-- The existing `campaigns` table belongs to e-commerce banners and is not used.
-- All instants are stored in UTC; `timezone` records the RM's wall-clock zone.

-- Relation Manager -> company scope. No such mapping existed before, so until
-- rows are added an RM can only send to the configured test users.
CREATE TABLE IF NOT EXISTS rm_company_assignments (
  rm_user_id INT NOT NULL,              -- eusers.user_id with role 'rm'
  company_id INT NOT NULL,              -- companies.company_id
  assigned_by INT NULL,                 -- eusers.user_id of the admin
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rm_user_id, company_id),
  KEY idx_rm_company_assignments_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_campaigns (
  campaign_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  source ENUM('template', 'manual') NOT NULL,
  template_id BIGINT UNSIGNED NULL,
  module VARCHAR(30) NOT NULL,
  category ENUM('marketing', 'engagement', 'announcement') NOT NULL,
  priority ENUM('low', 'normal', 'high') NOT NULL DEFAULT 'normal',
  title_en VARCHAR(255) NOT NULL,
  body_en TEXT NOT NULL,
  title_hi VARCHAR(255) NULL,
  body_hi TEXT NULL,
  title_mr VARCHAR(255) NULL,
  body_mr TEXT NULL,
  -- Comma list of reviewed translations, e.g. 'hi,mr'. Only admins set it;
  -- editing a translation removes it from this list.
  approved_languages VARCHAR(20) NOT NULL DEFAULT '',
  variables LONGTEXT NULL CHECK (variables IS NULL OR JSON_VALID(variables)),
  target_screen VARCHAR(60) NULL,
  reference_type VARCHAR(30) NULL,
  reference_id VARCHAR(64) NULL,
  image_url VARCHAR(500) NULL,
  audience_type ENUM('test', 'individual', 'selected', 'company', 'assigned_companies', 'module_users', 'all_companies') NOT NULL DEFAULT 'test',
  audience_filter LONGTEXT NULL CHECK (audience_filter IS NULL OR JSON_VALID(audience_filter)),
  delivery_mode ENUM('now', 'once', 'recurring') NOT NULL DEFAULT 'once',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata',
  scheduled_at DATETIME NULL,
  recurrence_type ENUM('none', 'daily', 'weekly', 'monthly') NOT NULL DEFAULT 'none',
  recurrence_end_at DATETIME NULL,
  max_occurrences INT UNSIGNED NULL,
  expires_at DATETIME NULL,
  next_run_at DATETIME NULL,
  occurrences_started INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('draft', 'pending_approval', 'approved', 'rejected', 'scheduled', 'sending',
              'completed', 'partially_failed', 'failed', 'cancelled', 'expired') NOT NULL DEFAULT 'draft',
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
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (campaign_id),
  KEY idx_notification_campaigns_due (status, next_run_at),
  KEY idx_notification_campaigns_creator (created_by, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-recipient delivery job. The unique key makes audience materialisation
-- idempotent across worker restarts; the matching notifications row uses the
-- idempotency key campaign:<id>:<occurrence>:<user> so retries never create a
-- second inbox entry.
CREATE TABLE IF NOT EXISTS notification_campaign_recipients (
  recipient_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id BIGINT UNSIGNED NOT NULL,
  occurrence_no INT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  language ENUM('en', 'hi', 'mr') NOT NULL DEFAULT 'en',
  status ENUM('pending', 'processing', 'sent', 'failed', 'skipped', 'cancelled') NOT NULL DEFAULT 'pending',
  skip_reason VARCHAR(60) NULL,
  notification_id INT NULL,
  devices_attempted TINYINT UNSIGNED NOT NULL DEFAULT 0,
  devices_accepted TINYINT UNSIGNED NOT NULL DEFAULT 0,
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
CREATE TABLE IF NOT EXISTS notification_campaign_audit_logs (
  audit_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id BIGINT UNSIGNED NULL,
  actor_user_id INT NOT NULL,
  actor_role VARCHAR(30) NOT NULL,
  action VARCHAR(40) NOT NULL,
  decision ENUM('allowed', 'denied') NOT NULL DEFAULT 'allowed',
  details LONGTEXT NULL CHECK (details IS NULL OR JSON_VALID(details)),
  ip_address VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (audit_id),
  KEY idx_campaign_audit_campaign (campaign_id, created_at),
  KEY idx_campaign_audit_actor (actor_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
