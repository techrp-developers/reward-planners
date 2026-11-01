-- Records which offer priced an order line and the normal price it replaced, so
-- admins, invoices and the app can show the offer after it has ended.
ALTER TABLE eorder_items
  ADD COLUMN promotional_content_id BIGINT UNSIGNED NULL AFTER flash_sale_campaign_id,
  ADD COLUMN original_price DECIMAL(10,2) NULL AFTER price,
  ADD KEY idx_eorder_items_promotional_content (promotional_content_id);

ALTER TABLE service_orders
  ADD COLUMN original_price DECIMAL(10,2) NULL AFTER price;
