-- Run once against the production database before deploying the matching code.

CREATE TABLE wallet_reservations (
  reservation_id BIGINT NOT NULL AUTO_INCREMENT,
  order_id INT NOT NULL,
  user_id INT NOT NULL,
  coins INT NOT NULL,
  status ENUM('reserved', 'consumed', 'released') NOT NULL DEFAULT 'reserved',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at DATETIME NULL,
  released_at DATETIME NULL,
  PRIMARY KEY (reservation_id),
  UNIQUE KEY uniq_wallet_reservation_order (order_id),
  KEY idx_wallet_reservation_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE order_refunds
  ADD COLUMN payment_id INT NULL AFTER order_id,
  ADD COLUMN refund_key VARCHAR(191) NULL AFTER vendor_order_id,
  ADD COLUMN retry_count INT NOT NULL DEFAULT 0 AFTER status,
  ADD COLUMN last_retried_at DATETIME NULL AFTER retry_count,
  ADD COLUMN last_error TEXT NULL AFTER last_retried_at,
  ADD UNIQUE KEY uniq_order_refund_key (refund_key),
  ADD KEY idx_order_refund_retry (status, retry_count, last_retried_at),
  ADD KEY idx_order_refund_payment (payment_id);

ALTER TABLE wallet_transactions
  MODIFY reason_code ENUM(
    'ORDER_REWARD',
    'REFERRAL_BONUS',
    'ADMIN_ADJUSTMENT',
    'REDEEM',
    'EXPIRY',
    'ORDER_REFUND',
    'SHIPMENT_REWARD_REFUND',
    'ORDER_REWARD_REVERSAL',
    'SHIPMENT_REWARD_REVERSAL'
  ) NULL DEFAULT 'ORDER_REWARD';

UPDATE order_payments SET razorpay_order_id = NULL WHERE razorpay_order_id = '';
UPDATE order_payments SET razorpay_payment_id = NULL WHERE razorpay_payment_id = '';
UPDATE order_shipments SET shipment_id = NULL WHERE shipment_id = '';
UPDATE order_shipments SET awb_number = NULL WHERE awb_number = '';

ALTER TABLE order_payments
  ADD UNIQUE KEY uniq_order_payments_razorpay_order (razorpay_order_id),
  ADD UNIQUE KEY uniq_order_payments_razorpay_payment (razorpay_payment_id);

ALTER TABLE order_shipments
  ADD COLUMN rto_processed TINYINT(1) NOT NULL DEFAULT 0 AFTER rto_at,
  ADD COLUMN cancel_sync_status ENUM('not_needed','pending','completed','failed')
    NOT NULL DEFAULT 'not_needed' AFTER cancelled_at,
  ADD COLUMN cancel_sync_attempts INT NOT NULL DEFAULT 0 AFTER cancel_sync_status,
  ADD COLUMN cancel_sync_last_error TEXT NULL AFTER cancel_sync_attempts,
  ADD UNIQUE KEY uniq_order_shipments_shipment_id (shipment_id),
  ADD UNIQUE KEY uniq_order_shipments_awb (awb_number);

UPDATE vendor_orders vo
JOIN order_shipments os ON os.vendor_order_id = vo.vendor_order_id
SET vo.shipping_status = CASE
  WHEN os.shipping_status = 'delivered' THEN 'delivered'
  WHEN os.shipping_status IN ('picked_up','in_transit','out_for_delivery')
    THEN 'shipped'
  WHEN os.shipping_status IN ('cancelled','rto') THEN 'cancelled'
  ELSE 'processing'
END;
