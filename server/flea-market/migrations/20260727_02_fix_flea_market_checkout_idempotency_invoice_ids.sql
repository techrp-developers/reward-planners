-- The live table (like flea_market_schedules before it) was created from an
-- older/simpler DDL than 20260725_04_..., with a singular invoice_id column
-- instead of invoice_ids — but checkoutService.js splits carts by vendor_id
-- into one invoice PER vendor and always writes an array (see
-- checkoutModel.js markCompleted/acquireProcessingSlot), so plural invoice_ids
-- is the correct design, not a rename target.
--
-- Also missing versus 20260725_04_...: the FK to flea_market_sessions and its
-- index. Not required for the app to function (nothing enforces it at the
-- DB level today), but included here to match the tracked migration.
ALTER TABLE flea_market_checkout_idempotency
  DROP COLUMN invoice_id,
  ADD COLUMN invoice_ids TEXT NULL,
  ADD KEY idx_fmci_session_id (session_id),
  ADD CONSTRAINT fk_fmci_session FOREIGN KEY (session_id) REFERENCES flea_market_sessions (session_id) ON DELETE CASCADE;
