-- External providers are independent of product vendors and in-house services.
CREATE TABLE IF NOT EXISTS svc_external_providers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS svc_provider_categories (
  provider_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (provider_id, category_id),
  CONSTRAINT fk_svc_offering_provider FOREIGN KEY (provider_id) REFERENCES svc_external_providers(id),
  CONSTRAINT fk_svc_offering_category FOREIGN KEY (category_id) REFERENCES svc_categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Historical enquiries remain NULL: no provider can be inferred from their data.
SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE svc_enquiries ADD COLUMN provider_id BIGINT UNSIGNED NULL',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='svc_enquiries' AND column_name='provider_id');
PREPARE external_services_stmt FROM @sql; EXECUTE external_services_stmt; DEALLOCATE PREPARE external_services_stmt;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE svc_enquiries ADD INDEX idx_svc_enquiries_provider (provider_id)',
  'SELECT 1') FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='svc_enquiries' AND index_name='idx_svc_enquiries_provider');
PREPARE external_services_stmt FROM @sql; EXECUTE external_services_stmt; DEALLOCATE PREPARE external_services_stmt;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE svc_enquiries ADD CONSTRAINT fk_svc_enquiries_provider FOREIGN KEY (provider_id) REFERENCES svc_external_providers(id)',
  'SELECT 1') FROM information_schema.table_constraints
  WHERE table_schema=DATABASE() AND table_name='svc_enquiries' AND constraint_name='fk_svc_enquiries_provider' AND constraint_type='FOREIGN KEY');
PREPARE external_services_stmt FROM @sql; EXECUTE external_services_stmt; DEALLOCATE PREPARE external_services_stmt;
