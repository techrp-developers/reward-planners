ALTER TABLE user_statuses
  ADD COLUMN company_id BIGINT UNSIGNED NULL AFTER user_id,
  ADD COLUMN visibility ENUM(
    'same_company',
    'all_companies',
    'all_except_companies',
    'custom_people'
  ) NOT NULL DEFAULT 'same_company' AFTER company_id,
  ADD INDEX idx_status_company_visibility (company_id, visibility, expires_at);

CREATE TABLE user_status_excluded_companies (
  status_id BIGINT UNSIGNED NOT NULL,
  company_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (status_id, company_id),
  INDEX idx_status_excluded_company (company_id),
  CONSTRAINT fk_status_excluded_status FOREIGN KEY (status_id)
    REFERENCES user_statuses (status_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_status_allowed_users (
  status_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (status_id, user_id),
  INDEX idx_status_allowed_user (user_id),
  CONSTRAINT fk_status_allowed_status FOREIGN KEY (status_id)
    REFERENCES user_statuses (status_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
