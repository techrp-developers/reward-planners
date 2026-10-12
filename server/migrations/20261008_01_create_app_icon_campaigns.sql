-- Schedule timestamps are UTC. iOS and Android campaigns share this table.
CREATE TABLE IF NOT EXISTS app_icon_campaigns (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  platform ENUM('ios', 'android') NOT NULL,
  icon_key ENUM('default', 'diwali', 'eid', 'christmas', 'holi', 'independence_day', 'navratri', 'dasera') NOT NULL,
  starts_at DATETIME(3) NOT NULL,
  ends_at DATETIME(3) NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_app_icon_resolution (platform, is_active, starts_at, ends_at, priority)
);
