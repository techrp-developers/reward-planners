-- Additive: no historical stock, invoice, vendor or product rows are changed.
-- Reviewed against the target SHOW CREATE TABLE snapshot (unsigned schedule IDs).
CREATE TABLE IF NOT EXISTS flea_market_event_vendors (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  schedule_id INT UNSIGNED NOT NULL,
  vendor_id INT NOT NULL,
  participation_type ENUM('existing','external') NOT NULL DEFAULT 'existing',
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  collection_model ENUM('unconfigured','reward_planners','vendor') NOT NULL DEFAULT 'unconfigured',
  commission_bps INT NULL,
  discount_funder ENUM('unconfigured','reward_planners','vendor') NOT NULL DEFAULT 'unconfigured',
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_vendor (schedule_id, vendor_id),
  FOREIGN KEY (schedule_id) REFERENCES flea_market_schedules(schedule_id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(vendor_id),
  FOREIGN KEY (created_by) REFERENCES eusers(user_id),
  CHECK (commission_bps IS NULL OR commission_bps BETWEEN 0 AND 10000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS flea_market_event_products (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  schedule_id INT UNSIGNED NOT NULL,
  vendor_id INT NOT NULL,
  product_id INT NOT NULL,
  variant_id INT NOT NULL,
  pool_id INT NOT NULL,
  assigned_qty INT NOT NULL,
  sold_qty INT NOT NULL DEFAULT 0,
  released_qty INT NOT NULL DEFAULT 0,
  event_selling_price DECIMAL(10,2) NULL,
  status ENUM('active','released') NOT NULL DEFAULT 'active',
  created_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_event_variant (schedule_id, variant_id),
  KEY ix_pool_reservations (pool_id, status),
  FOREIGN KEY (schedule_id, vendor_id) REFERENCES flea_market_event_vendors(schedule_id, vendor_id),
  FOREIGN KEY (product_id) REFERENCES eproducts(product_id),
  FOREIGN KEY (variant_id) REFERENCES product_variants(variant_id),
  FOREIGN KEY (pool_id) REFERENCES flea_market_vendor_stock(pool_id),
  FOREIGN KEY (created_by) REFERENCES eusers(user_id),
  CHECK (assigned_qty > 0 AND sold_qty >= 0 AND released_qty >= 0 AND sold_qty + released_qty <= assigned_qty),
  CHECK (event_selling_price IS NULL OR event_selling_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Separate from legacy flea_market_operators: these reference actual manager eusers.
CREATE TABLE IF NOT EXISTS flea_market_session_managers (
  session_id VARCHAR(64) NOT NULL PRIMARY KEY,
  manager_user_id INT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES flea_market_sessions(session_id),
  FOREIGN KEY (manager_user_id) REFERENCES eusers(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Bind existing idempotency records without rewriting historical rows.
CREATE TABLE IF NOT EXISTS flea_market_checkout_bindings (
  idempotency_key VARCHAR(80) NOT NULL PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  schedule_id INT UNSIGNED NOT NULL,
  customer_id INT NOT NULL,
  manager_user_id INT NOT NULL,
  request_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES flea_market_sessions(session_id),
  FOREIGN KEY (schedule_id) REFERENCES flea_market_schedules(schedule_id),
  FOREIGN KEY (customer_id) REFERENCES customer(user_id),
  FOREIGN KEY (manager_user_id) REFERENCES eusers(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS flea_market_payments (
  payment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  checkout_key VARCHAR(80) NOT NULL,
  schedule_id INT UNSIGNED NOT NULL,
  vendor_id INT NOT NULL,
  method ENUM('cash','card','upi') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending','confirmed','failed','refunded') NOT NULL DEFAULT 'pending',
  recipient ENUM('reward_planners','vendor') NOT NULL,
  reference_number VARCHAR(190) NULL,
  provider VARCHAR(40) NULL,
  provider_reference VARCHAR(190) NULL,
  operator_id INT NOT NULL,
  verification_source ENUM('cashier','manual_external','provider') NULL,
  confirmed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_checkout_vendor_payment (checkout_key,vendor_id),
  UNIQUE KEY uq_provider_payment (provider,provider_reference),
  KEY ix_event_payments (schedule_id,status),
  FOREIGN KEY (checkout_key) REFERENCES flea_market_checkout_bindings(idempotency_key),
  FOREIGN KEY (schedule_id,vendor_id) REFERENCES flea_market_event_vendors(schedule_id,vendor_id),
  FOREIGN KEY (operator_id) REFERENCES eusers(user_id),
  CHECK (amount >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
