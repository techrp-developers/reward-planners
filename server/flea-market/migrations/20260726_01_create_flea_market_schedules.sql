-- Roster of which company's flea market runs at which location, on which date.
-- Billing may only start for a company+location with an active, in-range
-- entry here for today (enforced in otpService, not just the UI).
CREATE TABLE IF NOT EXISTS flea_market_schedules (
  schedule_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id INT UNSIGNED NOT NULL,
  location_id INT UNSIGNED NOT NULL,
  scheduled_date DATE NOT NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  status ENUM('scheduled', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'scheduled',
  notes VARCHAR(255) NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (schedule_id),
  KEY idx_date_status (scheduled_date, status),
  KEY idx_company (company_id),
  CONSTRAINT fk_fmsch_company FOREIGN KEY (company_id) REFERENCES companies (company_id) ON DELETE CASCADE,
  CONSTRAINT fk_fmsch_location FOREIGN KEY (location_id) REFERENCES flea_market_locations (location_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
