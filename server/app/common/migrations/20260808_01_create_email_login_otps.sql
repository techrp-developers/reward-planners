-- Email-side OTP storage for the unified identifier login, mirrors phone_otps.
-- Kept separate from email_otps, which flea-market's own OTP flow (otpModel.js) also
-- writes to for unrelated vendor/checkout verification — sharing it would let the two
-- flows collide on attempt_count/is_verified for the same email address.
CREATE TABLE IF NOT EXISTS email_login_otps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(191) NOT NULL,
  otp VARCHAR(10) NOT NULL,
  expiry DATETIME NOT NULL,
  attempt_count INT DEFAULT 0,
  is_verified TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
