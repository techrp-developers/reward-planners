-- MySQL validates existing rows when adding an enforced CHECK. If this fails,
-- repair FOLLOW_UP rows with no date before retrying; do not disable checks.
-- Preflight: SELECT COUNT(*) FROM svc_enquiries
--            WHERE status = 'FOLLOW_UP' AND next_follow_up_at IS NULL;
SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE svc_enquiries ADD CONSTRAINT chk_svc_enq_followup CHECK (status <> ''FOLLOW_UP'' OR next_follow_up_at IS NOT NULL)',
  'SELECT 1') FROM information_schema.table_constraints
  WHERE table_schema=DATABASE() AND table_name='svc_enquiries' AND constraint_name='chk_svc_enq_followup');
PREPARE external_services_stmt FROM @sql; EXECUTE external_services_stmt; DEALLOCATE PREPARE external_services_stmt;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE svc_enquiry_activities ADD CONSTRAINT chk_svc_activity_status CHECK (activity_type <> ''STATUS_CHANGE'' OR (from_status IS NOT NULL AND to_status IS NOT NULL))',
  'SELECT 1') FROM information_schema.table_constraints
  WHERE table_schema=DATABASE() AND table_name='svc_enquiry_activities' AND constraint_name='chk_svc_activity_status');
PREPARE external_services_stmt FROM @sql; EXECUTE external_services_stmt; DEALLOCATE PREPARE external_services_stmt;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE svc_enquiries ADD COLUMN assigned_staff_id INT NULL',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema=DATABASE() AND table_name='svc_enquiries' AND column_name='assigned_staff_id');
PREPARE external_services_stmt FROM @sql; EXECUTE external_services_stmt; DEALLOCATE PREPARE external_services_stmt;

SET @sql := (SELECT IF(COUNT(*) = 0,
  'ALTER TABLE svc_enquiries ADD INDEX idx_svc_enquiries_assigned_status (assigned_staff_id,status)',
  'SELECT 1') FROM information_schema.statistics
  WHERE table_schema=DATABASE() AND table_name='svc_enquiries' AND index_name='idx_svc_enquiries_assigned_status');
PREPARE external_services_stmt FROM @sql; EXECUTE external_services_stmt; DEALLOCATE PREPARE external_services_stmt;
