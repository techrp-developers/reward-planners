-- Phone OTP storage for phone-number login/signup, mirrors email_otps.
CREATE TABLE IF NOT EXISTS phone_otps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  otp VARCHAR(10) NOT NULL,
  expiry DATETIME NOT NULL,
  attempt_count INT DEFAULT 0,
  is_verified TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
