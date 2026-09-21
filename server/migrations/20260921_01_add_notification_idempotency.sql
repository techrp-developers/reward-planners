-- Prevent concurrent API/cron instances from creating and pushing the same
-- logical notification more than once. NULL keeps ordinary notifications
-- unrestricted; producers that need exactly-once delivery provide a key.
ALTER TABLE notifications
  ADD COLUMN idempotency_key VARCHAR(191) NULL AFTER priority,
  ADD UNIQUE KEY uq_notifications_idempotency_key (idempotency_key);
