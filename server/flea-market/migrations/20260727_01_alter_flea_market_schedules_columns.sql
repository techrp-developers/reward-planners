-- The table as originally created locally was missing notes/created_by,
-- had start_time/end_time as NOT NULL, and used status 'active' instead of
-- 'in_progress' — all out of sync with scheduleModel.js/scheduleService.js.
-- Safe to run idempotently only if these columns don't already exist; check
-- before applying to an environment where this migration hasn't run yet.
ALTER TABLE flea_market_schedules
  MODIFY start_time TIME NULL,
  MODIFY end_time TIME NULL,
  MODIFY status ENUM('scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  ADD COLUMN notes VARCHAR(255) NULL AFTER end_time,
  ADD COLUMN created_by INT UNSIGNED NULL AFTER notes,
  ADD KEY idx_date_status (scheduled_date, status);
