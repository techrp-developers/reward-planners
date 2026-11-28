SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE svc_enquiries ADD INDEX idx_svc_enquiries_provider_status_created (provider_id,status,created_at)',
  'SELECT 1') FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='svc_enquiries' AND index_name='idx_svc_enquiries_provider_status_created');
PREPARE external_services_stmt FROM @sql; EXECUTE external_services_stmt; DEALLOCATE PREPARE external_services_stmt;