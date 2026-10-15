CREATE TABLE IF NOT EXISTS company_polls (
  poll_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  question VARCHAR(500) NOT NULL,
  allow_multiple TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('published', 'closed') NOT NULL DEFAULT 'published',
  closes_at DATETIME NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (poll_id),
  KEY idx_company_polls_company_status (company_id, status, created_at),
  CONSTRAINT fk_company_polls_company FOREIGN KEY (company_id) REFERENCES companies(company_id),
  CONSTRAINT fk_company_polls_creator FOREIGN KEY (created_by) REFERENCES eusers(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_poll_options (
  option_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  poll_id BIGINT UNSIGNED NOT NULL,
  option_text VARCHAR(250) NOT NULL,
  display_order SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (option_id),
  UNIQUE KEY uq_company_poll_option_order (poll_id, display_order),
  CONSTRAINT fk_company_poll_options_poll FOREIGN KEY (poll_id) REFERENCES company_polls(poll_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_poll_votes (
  vote_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  poll_id BIGINT UNSIGNED NOT NULL,
  option_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (vote_id),
  UNIQUE KEY uq_company_poll_vote (poll_id, option_id, user_id),
  KEY idx_company_poll_votes_user (user_id, poll_id),
  CONSTRAINT fk_company_poll_votes_poll FOREIGN KEY (poll_id) REFERENCES company_polls(poll_id) ON DELETE CASCADE,
  CONSTRAINT fk_company_poll_votes_option FOREIGN KEY (option_id) REFERENCES company_poll_options(option_id) ON DELETE CASCADE,
  CONSTRAINT fk_company_poll_votes_user FOREIGN KEY (user_id) REFERENCES customer(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
