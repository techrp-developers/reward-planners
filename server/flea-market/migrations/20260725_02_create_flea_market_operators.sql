-- Terminal operators (cashiers/managers) assigned to a location.
CREATE TABLE IF NOT EXISTS flea_market_operators (
  operator_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  location_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'cashier',
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (operator_id),
  KEY idx_fmo_location_status (location_id, status),
  CONSTRAINT fk_fmo_location FOREIGN KEY (location_id) REFERENCES flea_market_locations (location_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
