CREATE TABLE IF NOT EXISTS user_statuses (
  status_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM('text', 'image', 'video') NOT NULL,
  text_content VARCHAR(700) NULL,
  background_color CHAR(7) NULL,
  font_style VARCHAR(40) NULL,
  media_key VARCHAR(500) NULL,
  media_mime_type VARCHAR(100) NULL,
  media_duration_seconds SMALLINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  deleted_at DATETIME NULL,
  PRIMARY KEY (status_id),
  INDEX idx_status_active (expires_at, deleted_at),
  INDEX idx_status_user_active (user_id, expires_at, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_status_views (
  status_id BIGINT UNSIGNED NOT NULL,
  viewer_id BIGINT UNSIGNED NOT NULL,
  viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (status_id, viewer_id),
  INDEX idx_status_views_viewer (viewer_id, viewed_at),
  CONSTRAINT fk_status_views_status FOREIGN KEY (status_id)
    REFERENCES user_statuses (status_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
