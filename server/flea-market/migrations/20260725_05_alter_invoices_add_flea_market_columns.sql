-- Tag invoices originating from in-store flea-market checkouts and trace them back
-- to the location/session that created them.
ALTER TABLE invoices
  ADD COLUMN source ENUM('ecommerce', 'flea_market') NOT NULL DEFAULT 'ecommerce',
  ADD COLUMN location_id INT UNSIGNED NULL,
  ADD COLUMN session_id VARCHAR(64) NULL;

ALTER TABLE invoices
  ADD CONSTRAINT fk_invoices_fm_location FOREIGN KEY (location_id) REFERENCES flea_market_locations (location_id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_invoices_fm_session FOREIGN KEY (session_id) REFERENCES flea_market_sessions (session_id) ON DELETE SET NULL;
