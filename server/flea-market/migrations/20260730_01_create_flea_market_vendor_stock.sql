-- Persistent per-(vendor,variant) stock pool, replacing per-event allocations
-- (flea_market_stock_allocations) now that only one flea market event ever
-- runs at a time (confirmed business rule, sequential/non-overlapping) — stock
-- lives in ONE pool until explicitly returned to the vendor's warehouse, not
-- re-allocated from scratch for every event.
--
-- This table was actually created live against the dev DB (matching this DDL)
-- before this migration file was written — this file documents/formalizes it.
-- See scripts/migrate-allocations-to-vendor-stock.js for the executable data
-- migration (row consolidation + flea_market_stock_logs repoint + archive),
-- which this checked-in .sql alone cannot express since it needs the old
-- table's data to populate the new one.
CREATE TABLE IF NOT EXISTS flea_market_vendor_stock (
  pool_id INT NOT NULL AUTO_INCREMENT,
  vendor_id INT NOT NULL,
  product_id INT NOT NULL,
  variant_id INT NOT NULL,
  allocated_qty INT NOT NULL DEFAULT 0,
  sold_qty INT NOT NULL DEFAULT 0,
  damaged_qty INT NOT NULL DEFAULT 0,
  returned_qty INT NOT NULL DEFAULT 0,
  available_qty INT GENERATED ALWAYS AS (allocated_qty - sold_qty - damaged_qty - returned_qty) STORED,
  allocation_price DECIMAL(10,2) DEFAULT NULL,
  status ENUM('active', 'closed') NOT NULL DEFAULT 'active',
  -- Nullable: no operator auth exists anywhere in this module yet (matches
  -- flea_market_stock_allocations.allocated_by, where every existing row is
  -- NULL) — NOT NULL here would reject every insert until real auth exists.
  allocated_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (pool_id),
  UNIQUE KEY uniq_vendor_variant_pool (vendor_id, variant_id),
  KEY idx_fvs_vendor (vendor_id),
  KEY idx_fvs_variant (variant_id),
  CONSTRAINT fk_fvs_vendor FOREIGN KEY (vendor_id) REFERENCES vendors (vendor_id),
  CONSTRAINT fk_fvs_product FOREIGN KEY (product_id) REFERENCES eproducts (product_id),
  CONSTRAINT fk_fvs_variant FOREIGN KEY (variant_id) REFERENCES product_variants (variant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
