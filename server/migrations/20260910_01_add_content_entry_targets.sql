ALTER TABLE content_zone_entries
  ADD COLUMN target_type ENUM('product', 'category', 'subcategory') NULL AFTER redirect_link,
  ADD COLUMN target_id BIGINT UNSIGNED NULL AFTER target_type,
  ADD INDEX idx_content_entry_target (target_type, target_id);
