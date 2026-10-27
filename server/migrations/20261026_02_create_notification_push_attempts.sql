-- PROPOSAL: review before running. Additive only; touches no existing table.
--
-- One row per FCM send attempt (retries included). status 'accepted' means
-- FCM accepted the message, NOT that the device displayed it. Raw tokens are
-- never stored: token_hash links rows to a device, token_preview is masked.
-- Until this table exists, app/common/utils/notification.js sends normally
-- and only skips the audit trail.
CREATE TABLE IF NOT EXISTS notification_push_attempts (
  attempt_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  notification_id INT NULL,
  user_id INT NOT NULL,
  push_token_id BIGINT UNSIGNED NULL,
  token_hash CHAR(64) NULL,
  token_preview VARCHAR(32) NULL,
  platform ENUM('android', 'ios') NULL,
  firebase_project_id VARCHAR(100) NULL,
  attempt_no TINYINT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('accepted', 'failed') NOT NULL,
  fcm_message_id VARCHAR(255) NULL,
  error_code VARCHAR(100) NULL,
  error_message VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (attempt_id),
  KEY idx_push_attempts_notification (notification_id),
  KEY idx_push_attempts_user_created (user_id, created_at),
  KEY idx_push_attempts_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
