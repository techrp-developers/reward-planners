CREATE TABLE IF NOT EXISTS transaction_reward_settings (
  module VARCHAR(20) NOT NULL PRIMARY KEY,
  ranges_json JSON NOT NULL,
  expiry_days INT NOT NULL DEFAULT 90,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transaction_reward_awards (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  module VARCHAR(20) NOT NULL,
  reference_id INT NOT NULL,
  user_id INT NOT NULL,
  paid_amount DECIMAL(12,2) NOT NULL,
  points INT NOT NULL,
  balance_after INT NULL,
  notification_sent TINYINT NOT NULL DEFAULT 0,
  whatsapp_queued TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_transaction_reward (module, reference_id),
  KEY pending_notifications (notification_sent, whatsapp_queued)
) ENGINE=InnoDB;
