-- REVIEW ONLY. Confirm exact enum/index definitions against the backup first.
-- Existing reasons are preserved. No UPDATE of historical rows or balances.
-- SERVICE_REFUND provides a module-specific namespace for restored service coins.
ALTER TABLE wallet_transactions MODIFY COLUMN reason_code
 ENUM('ORDER_REWARD','REFERRAL_BONUS','ADMIN_ADJUSTMENT','REDEEM','EXPIRY','ORDER_REFUND','SHIPMENT_REWARD_REFUND','ORDER_REWARD_REVERSAL','SHIPMENT_REWARD_REVERSAL','SERVICE_REWARD','SERVICE_REDEEM','SERVICE_REFUND')
 NULL DEFAULT 'ORDER_REWARD';
-- Preserve uniq_wallet_order_reward exactly; do not recreate an equivalent key.
ALTER TABLE service_order_refunds
 ADD COLUMN claim_token CHAR(36) NULL,
 ADD COLUMN claim_expires_at DATETIME NULL,
 ADD COLUMN submission_state ENUM('review_required','ready','submitting','uncertain','submitted') NOT NULL DEFAULT 'review_required',
 ADD UNIQUE KEY uq_service_refund_method (service_order_id,refund_method),
 ADD UNIQUE KEY uq_service_gateway_refund (razorpay_refund_id);
-- Existing refund rows default to review_required, NEVER automatically ready.
-- New approvals explicitly insert ready after policy/schema checks.
-- Settlement flags stay OFF until compatibility/concurrency tests and approval.
-- Rollback application first. Retain all populated claims, provider IDs, and new
-- reason values. Do not narrow enums or erase financial history after use.
