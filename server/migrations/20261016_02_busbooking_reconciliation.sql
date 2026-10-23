-- REVIEW/STAGING FIRST. Do not auto-apply to rewardplanners_db or production.
-- Contract: app/busboooking/services/bookingService.js and refundService.js.
-- Precondition: busbooking_orders/cancellations match the inspected 2026-10-16
-- schema. The 20260926 production_safety migration supplies cancellations but
-- does not supply these reconciliation/refund fields. No history is fabricated.
ALTER TABLE busbooking_orders
  ADD COLUMN booking_error VARCHAR(1000) NULL,
  ADD COLUMN booking_attempted_at DATETIME NULL,
  MODIFY COLUMN status ENUM('pending_payment','payment_success','confirmed',
    'booking_failed','cancelled','expired','booking_in_progress','booking_review')
    NOT NULL DEFAULT 'pending_payment';

ALTER TABLE busbooking_cancellations
  ADD COLUMN refund_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- Each field is read/written by the existing refund service. Order/cancellation
-- ID types match SHOW CREATE TABLE; unique keys enforce the service's retry keys.
CREATE TABLE IF NOT EXISTS busbooking_refunds (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  busbooking_order_id INT NOT NULL,
  cancellation_id BIGINT UNSIGNED NULL,
  user_id INT NOT NULL,
  reason VARCHAR(100) NOT NULL,
  refund_key VARCHAR(190) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending','initiated','processed','failed') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_attempt_at DATETIME NULL,
  last_error VARCHAR(1000) NULL,
  razorpay_payment_id VARCHAR(100) NULL,
  razorpay_refund_id VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_bus_refund_key (refund_key),
  UNIQUE KEY uq_bus_gateway_refund (razorpay_refund_id),
  KEY ix_bus_refund_retry (status,last_attempt_at),
  KEY ix_bus_refund_order (busbooking_order_id),
  FOREIGN KEY (busbooking_order_id) REFERENCES busbooking_orders(id),
  FOREIGN KEY (cancellation_id) REFERENCES busbooking_cancellations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
