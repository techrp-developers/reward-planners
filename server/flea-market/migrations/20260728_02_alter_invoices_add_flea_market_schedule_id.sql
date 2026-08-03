-- Directly traces flea-market invoices to the schedule/event that produced
-- them. This replaces fragile report-time inference through session/location/date.
ALTER TABLE invoices
  ADD COLUMN schedule_id INT UNSIGNED NULL;

ALTER TABLE invoices
  ADD KEY idx_invoices_fm_schedule (schedule_id);

UPDATE invoices i
JOIN flea_market_sessions fms ON fms.session_id = i.session_id
JOIN flea_market_schedules fs
  ON fs.location_id = fms.location_id
 AND fs.company_id = fms.company_id
 AND fs.scheduled_date = DATE(fms.otp_verified_at)
 AND fs.status != 'cancelled'
SET i.schedule_id = fs.schedule_id
WHERE i.source = 'flea_market'
  AND i.schedule_id IS NULL;

ALTER TABLE invoices
  ADD CONSTRAINT fk_invoices_fm_schedule
  FOREIGN KEY (schedule_id) REFERENCES flea_market_schedules (schedule_id)
  ON DELETE SET NULL;
