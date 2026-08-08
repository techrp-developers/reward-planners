-- Idempotency ledger for POST /flea-market/checkout. A single checkout can produce
-- multiple invoices (cart split by eproducts.vendor_id), hence invoice_ids as JSON
-- rather than a single invoice_id column.
CREATE TABLE IF NOT EXISTS flea_market_checkout_idempotency (
  idempotency_key VARCHAR(80) NOT NULL,
  session_id VARCHAR(64) NOT NULL,
  invoice_ids JSON NULL,
  status ENUM('processing', 'completed', 'failed') NOT NULL DEFAULT 'processing',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idempotency_key),
  KEY idx_fmci_session_id (session_id),
  CONSTRAINT fk_fmci_session FOREIGN KEY (session_id) REFERENCES flea_market_sessions (session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
