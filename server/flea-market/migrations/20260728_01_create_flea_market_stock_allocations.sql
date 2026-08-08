-- Event-scoped inventory: stock allocated from the master catalog to a
-- specific flea market event (schedule), so billing at that event can only
-- sell what was physically shipped there, not the whole online catalog.
--
-- Column types (INT, not INT UNSIGNED) match the existing FK targets exactly
-- (vendors.vendor_id, eproducts.product_id, product_variants.variant_id,
-- flea_market_schedules.schedule_id are all plain int(11)).
--
-- allocated_by is nullable with no FK — this module has no real operator
-- auth yet (see flea_market_schedules.created_by, which has the same gap
-- and is always left NULL today; requireFleaMarketSession is customer OTP
-- auth, not an operator login). Tighten this once operator auth exists.
CREATE TABLE IF NOT EXISTS flea_market_stock_allocations (
  allocation_id INT NOT NULL AUTO_INCREMENT,
  schedule_id INT NOT NULL,
  vendor_id INT NOT NULL,
  product_id INT NOT NULL,
  variant_id INT NOT NULL,
  allocated_qty INT NOT NULL,
  sold_qty INT NOT NULL DEFAULT 0,
  damaged_qty INT NOT NULL DEFAULT 0,
  returned_qty INT NOT NULL DEFAULT 0,
  available_qty INT GENERATED ALWAYS AS (allocated_qty - sold_qty - damaged_qty) STORED,
  -- Event-specific override price; NULL means use product_variants.sale_price.
  allocation_price DECIMAL(10,2) DEFAULT NULL,
  status ENUM('allocated', 'active', 'completed', 'closed') NOT NULL DEFAULT 'allocated',
  allocated_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (allocation_id),
  UNIQUE KEY uniq_event_product (schedule_id, vendor_id, variant_id),
  KEY idx_fmsa_schedule (schedule_id),
  KEY idx_fmsa_vendor (vendor_id),
  KEY idx_fmsa_variant (variant_id),
  CONSTRAINT fk_fmsa_schedule FOREIGN KEY (schedule_id) REFERENCES flea_market_schedules (schedule_id) ON DELETE CASCADE,
  CONSTRAINT fk_fmsa_vendor FOREIGN KEY (vendor_id) REFERENCES vendors (vendor_id),
  CONSTRAINT fk_fmsa_product FOREIGN KEY (product_id) REFERENCES eproducts (product_id),
  CONSTRAINT fk_fmsa_variant FOREIGN KEY (variant_id) REFERENCES product_variants (variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS flea_market_stock_logs (
  log_id INT NOT NULL AUTO_INCREMENT,
  allocation_id INT NOT NULL,
  action ENUM('allocated', 'sale', 'return', 'damage', 'adjustment') NOT NULL,
  quantity INT NOT NULL,
  remarks VARCHAR(255) NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (log_id),
  KEY idx_fmsl_allocation (allocation_id),
  CONSTRAINT fk_fmsl_allocation FOREIGN KEY (allocation_id) REFERENCES flea_market_stock_allocations (allocation_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Flag quick-created products so bypassed-approval items stay auditable.
ALTER TABLE eproducts
  ADD COLUMN created_via ENUM('standard', 'flea_market_quick_create') NOT NULL DEFAULT 'standard';
