SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE svc_categories ADD COLUMN icon_key VARCHAR(40) DEFAULT NULL',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='svc_categories' AND column_name='icon_key');
PREPARE external_services_stmt FROM @sql; EXECUTE external_services_stmt; DEALLOCATE PREPARE external_services_stmt;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE svc_categories ADD COLUMN short_description VARCHAR(160) DEFAULT NULL',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='svc_categories' AND column_name='short_description');
PREPARE external_services_stmt FROM @sql; EXECUTE external_services_stmt; DEALLOCATE PREPARE external_services_stmt;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE svc_category_fields ADD COLUMN field_group VARCHAR(20) DEFAULT NULL',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='svc_category_fields' AND column_name='field_group');
PREPARE external_services_stmt FROM @sql; EXECUTE external_services_stmt; DEALLOCATE PREPARE external_services_stmt;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE svc_category_fields ADD COLUMN help_text VARCHAR(200) DEFAULT NULL',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='svc_category_fields' AND column_name='help_text');
PREPARE external_services_stmt FROM @sql; EXECUTE external_services_stmt; DEALLOCATE PREPARE external_services_stmt;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE svc_category_fields ADD CONSTRAINT chk_svc_category_fields_group CHECK (field_group IS NULL OR field_group IN (''TREATMENT'',''CONDITION'',''DETAILS''))',
  'SELECT 1') FROM information_schema.table_constraints
  WHERE table_schema=DATABASE() AND table_name='svc_category_fields' AND constraint_name='chk_svc_category_fields_group');
PREPARE external_services_stmt FROM @sql; EXECUTE external_services_stmt; DEALLOCATE PREPARE external_services_stmt;

CREATE TABLE IF NOT EXISTS svc_enquiry_photo_uploads (
  reference_id CHAR(36) NOT NULL PRIMARY KEY,
  customer_user_id BIGINT UNSIGNED NOT NULL,
  storage_key VARCHAR(255) NOT NULL UNIQUE,
  claimed_item_id BIGINT UNSIGNED DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at DATETIME DEFAULT NULL,
  KEY idx_svc_photo_upload_owner (customer_user_id, claimed_item_id, created_at),
  CONSTRAINT fk_svc_photo_upload_item FOREIGN KEY (claimed_item_id) REFERENCES svc_enquiry_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
