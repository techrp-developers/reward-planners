-- REVIEW ONLY. This local schema lacks columns required by existing checkout
-- and orderOfferColumns. Run ONLY if information_schema confirms they are absent.
-- Existing orders remain NULL; do not reconstruct historical prices or offers.
ALTER TABLE service_orders
  ADD COLUMN flash_sale_campaign_id INT NULL,
  ADD COLUMN original_price DECIMAL(10,2) NULL;
-- Wallet reason expansion is deliberately not automated: inspect existing enum
-- values and idempotency indexes, retain ALL existing reason codes, and add
-- SERVICE_REWARD (and other service codes required by the deployed code) only
-- after wallet regression review. Reward activation stays blocked until ready.
-- Rollback: stop new order creation before removing added columns; retain them
-- if any new order has recorded a snapshot. Never rewrite historical amounts.
