ALTER TABLE razorpay_orders
  MODIFY COLUMN module
  ENUM('service', 'bbps', 'ecommerce', 'busbooking')
  NOT NULL;

CREATE TABLE IF NOT EXISTS busbooking_cancellations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  busbooking_order_id INT NOT NULL,
  user_id INT NOT NULL,
  seat_name VARCHAR(100) NOT NULL,
  remarks VARCHAR(500) NOT NULL,
  status ENUM('processing', 'succeeded', 'failed') NOT NULL DEFAULT 'processing',
  refund_status ENUM('not_requested', 'pending', 'processed', 'failed') NOT NULL DEFAULT 'not_requested',
  provider_cancel_id VARCHAR(100) NULL,
  provider_status VARCHAR(100) NULL,
  provider_error_code VARCHAR(100) NULL,
  provider_error_message VARCHAR(1000) NULL,
  raw_response LONGTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_busbooking_cancel_order_seat (busbooking_order_id, seat_name),
  KEY idx_busbooking_cancel_user (user_id),
  KEY idx_busbooking_cancel_status (status, refund_status),
  CONSTRAINT fk_busbooking_cancel_order
    FOREIGN KEY (busbooking_order_id) REFERENCES busbooking_orders(id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE busbooking_cancellations
  ADD COLUMN IF NOT EXISTS provider_cancel_id VARCHAR(100) NULL AFTER refund_status,
  ADD COLUMN IF NOT EXISTS provider_status VARCHAR(100) NULL AFTER provider_cancel_id;
