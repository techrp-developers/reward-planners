-- REVIEW ONLY; MariaDB 10.4. Back up and run p0 prechecks first.
-- Apply each statement ONLY if its object/values are absent. No startup DDL.
-- Existing campaigns remain unclassified; do not infer a product/service owner.
ALTER TABLE campaigns ADD COLUMN module ENUM('product','service') NULL;
-- Preserve every existing redirect value, appending only service values.
ALTER TABLE campaigns MODIFY COLUMN redirect_type
  ENUM('category','subcategory','product','brand','campaign','external_url','service','service_category','service_bundle') NULL DEFAULT NULL;
CREATE TABLE campaign_service_items (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  campaign_id BIGINT NOT NULL,
  service_id INT NOT NULL,
  variant_id INT NOT NULL,
  offer_price DECIMAL(10,2) NULL,
  UNIQUE KEY uq_campaign_service_variant (campaign_id,variant_id),
  KEY idx_campaign_service_parent (service_id),
  KEY idx_campaign_service_variant (variant_id),
  CONSTRAINT fk_campaign_service_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(campaign_id),
  CONSTRAINT fk_campaign_service_parent FOREIGN KEY (service_id) REFERENCES services(id),
  CONSTRAINT fk_campaign_service_variant FOREIGN KEY (variant_id) REFERENCES service_variants(id),
  CONSTRAINT chk_campaign_service_price CHECK (offer_price IS NULL OR offer_price>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Rollback: revert application features first. Retain populated bindings/module
-- values and all old enums. Remove only unused additions after an export/review.
-- Older campaign module assignment requires a separate approved ownership list.
