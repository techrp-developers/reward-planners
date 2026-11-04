-- PROPOSAL: review before running. Additive only; touches no existing table.
--
-- Per-employee notification preferences. Applies to marketing and engagement
-- templates only; transactional notifications (orders, payments, reminders,
-- security) are never blocked by these settings.
--
-- Until this table exists, marketing/engagement templates are skipped with
-- reason "preferences_unavailable". A user with no row receives English and
-- is NOT treated as consenting to marketing/engagement. Rows created by
-- PUT /v1/notification/preferences store explicit opt-in values (0 unless the
-- employee opts in); the column defaults below only apply to manual inserts.
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id INT NOT NULL,
  language ENUM('en', 'hi', 'mr') NOT NULL DEFAULT 'en',
  marketing_enabled TINYINT(1) NOT NULL DEFAULT 1,
  engagement_enabled TINYINT(1) NOT NULL DEFAULT 1,
  -- Local time in SCHEDULE_TIMEZONE (default Asia/Kolkata); may cross midnight.
  quiet_hours_start TIME NULL,
  quiet_hours_end TIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
