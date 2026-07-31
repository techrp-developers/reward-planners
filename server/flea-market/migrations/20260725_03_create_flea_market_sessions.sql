-- OTP-verified, 15-minute in-store checkout sessions tying a customer to a location.
CREATE TABLE IF NOT EXISTS flea_market_sessions (
  session_id VARCHAR(64) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  company_id INT UNSIGNED NOT NULL,
  location_id INT UNSIGNED NOT NULL,
  operator_id INT UNSIGNED NULL,
  otp_verified_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  status ENUM('active', 'completed', 'expired') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (session_id),
  KEY idx_fms_user_status (user_id, status),
  KEY idx_fms_expires_at (expires_at),
  CONSTRAINT fk_fms_user FOREIGN KEY (user_id) REFERENCES customer (user_id) ON DELETE CASCADE,
  CONSTRAINT fk_fms_company FOREIGN KEY (company_id) REFERENCES companies (company_id) ON DELETE CASCADE,
  CONSTRAINT fk_fms_location FOREIGN KEY (location_id) REFERENCES flea_market_locations (location_id) ON DELETE CASCADE,
  CONSTRAINT fk_fms_operator FOREIGN KEY (operator_id) REFERENCES flea_market_operators (operator_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
