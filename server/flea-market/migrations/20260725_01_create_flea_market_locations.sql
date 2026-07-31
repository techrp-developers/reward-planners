-- Flea Market in-store billing: locations a company operates.
CREATE TABLE IF NOT EXISTS flea_market_locations (
  location_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id INT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  address VARCHAR(500) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (location_id),
  KEY idx_fml_company_status (company_id, status),
  CONSTRAINT fk_fml_company FOREIGN KEY (company_id) REFERENCES companies (company_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
