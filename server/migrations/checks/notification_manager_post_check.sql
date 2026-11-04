-- =====================================================================
-- READ-ONLY post-migration check (SELECT statements only).
-- Run in phpMyAdmin on rewardplanners_db AFTER the three migrations.
-- =====================================================================

-- A. All notification tables exist (expect 12 rows, all 'exists').
SELECT t.table_name AS expected_table,
       IF(i.TABLE_NAME IS NULL, 'MISSING', 'exists') AS state
FROM (
  SELECT 'notifications' AS table_name UNION ALL SELECT 'notification_templates'
  UNION ALL SELECT 'notification_preferences' UNION ALL SELECT 'user_push_tokens'
  UNION ALL SELECT 'customer' UNION ALL SELECT 'notification_media'
  UNION ALL SELECT 'notification_open_events' UNION ALL SELECT 'notification_push_attempts'
  UNION ALL SELECT 'notification_campaigns' UNION ALL SELECT 'notification_campaign_recipients'
  UNION ALL SELECT 'notification_campaign_audit_logs' UNION ALL SELECT 'rm_company_assignments'
) t
LEFT JOIN information_schema.TABLES i
  ON i.TABLE_SCHEMA = DATABASE() AND i.TABLE_NAME = t.table_name
ORDER BY state, expected_table;

-- B. Every column the backend reads/writes exists with a compatible type.
--    Expect ZERO rows. Any row is a column to fix before using the dashboard.
--    JSON columns appear as longtext on MariaDB and json on MySQL; both pass.
SELECT e.table_name, e.column_name, e.expected_type, c.COLUMN_TYPE AS actual_type,
       IF(c.COLUMN_NAME IS NULL, 'MISSING', 'TYPE DIFFERS') AS problem
FROM (
  SELECT 'notification_campaigns' AS table_name, 'campaign_id' AS column_name, 'bigint' AS expected_type
  UNION ALL SELECT 'notification_campaigns', 'name', 'varchar(150)'
  UNION ALL SELECT 'notification_campaigns', 'source', 'enum'
  UNION ALL SELECT 'notification_campaigns', 'template_id', 'bigint'
  UNION ALL SELECT 'notification_campaigns', 'module', 'varchar(30)'
  UNION ALL SELECT 'notification_campaigns', 'category', 'enum'
  UNION ALL SELECT 'notification_campaigns', 'announcement_type', 'varchar(40)'
  UNION ALL SELECT 'notification_campaigns', 'client_request_id', 'varchar(64)'
  UNION ALL SELECT 'notification_templates', 'created_by', 'int'
  UNION ALL SELECT 'user_push_tokens', 'firebase_project_id', 'varchar(100)'
  UNION ALL SELECT 'notification_campaigns', 'content_type', 'enum'
  UNION ALL SELECT 'notification_campaigns', 'priority', 'enum'
  UNION ALL SELECT 'notification_campaigns', 'title_en', 'varchar(255)'
  UNION ALL SELECT 'notification_campaigns', 'body_en', 'text'
  UNION ALL SELECT 'notification_campaigns', 'title_hi', 'varchar(255)'
  UNION ALL SELECT 'notification_campaigns', 'body_hi', 'text'
  UNION ALL SELECT 'notification_campaigns', 'title_mr', 'varchar(255)'
  UNION ALL SELECT 'notification_campaigns', 'body_mr', 'text'
  UNION ALL SELECT 'notification_campaigns', 'approved_languages', 'varchar(20)'
  UNION ALL SELECT 'notification_campaigns', 'variables', 'json'
  UNION ALL SELECT 'notification_campaigns', 'target_screen', 'varchar(60)'
  UNION ALL SELECT 'notification_campaigns', 'destination_type', 'varchar(40)'
  UNION ALL SELECT 'notification_campaigns', 'destination_id', 'varchar(64)'
  UNION ALL SELECT 'notification_campaigns', 'catalog_product_ids', 'json'
  UNION ALL SELECT 'notification_campaigns', 'reference_type', 'varchar(30)'
  UNION ALL SELECT 'notification_campaigns', 'reference_id', 'varchar(64)'
  UNION ALL SELECT 'notification_campaigns', 'image_url', 'varchar(500)'
  UNION ALL SELECT 'notification_campaigns', 'media', 'json'
  UNION ALL SELECT 'notification_campaigns', 'audience_type', 'enum'
  UNION ALL SELECT 'notification_campaigns', 'audience_filter', 'json'
  UNION ALL SELECT 'notification_campaigns', 'delivery_mode', 'enum'
  UNION ALL SELECT 'notification_campaigns', 'timezone', 'varchar(64)'
  UNION ALL SELECT 'notification_campaigns', 'scheduled_at', 'datetime'
  UNION ALL SELECT 'notification_campaigns', 'recurrence_type', 'enum'
  UNION ALL SELECT 'notification_campaigns', 'recurrence_end_at', 'datetime'
  UNION ALL SELECT 'notification_campaigns', 'max_occurrences', 'int'
  UNION ALL SELECT 'notification_campaigns', 'expires_at', 'datetime'
  UNION ALL SELECT 'notification_campaigns', 'next_run_at', 'datetime'
  UNION ALL SELECT 'notification_campaigns', 'occurrences_started', 'int'
  UNION ALL SELECT 'notification_campaigns', 'status', 'enum'
  UNION ALL SELECT 'notification_campaigns', 'estimated_recipients', 'int'
  UNION ALL SELECT 'notification_campaigns', 'created_by', 'int'
  UNION ALL SELECT 'notification_campaigns', 'created_by_role', 'varchar(30)'
  UNION ALL SELECT 'notification_campaigns', 'updated_by', 'int'
  UNION ALL SELECT 'notification_campaigns', 'submitted_at', 'datetime'
  UNION ALL SELECT 'notification_campaigns', 'approved_by', 'int'
  UNION ALL SELECT 'notification_campaigns', 'approved_at', 'datetime'
  UNION ALL SELECT 'notification_campaigns', 'rejection_reason', 'varchar(500)'
  UNION ALL SELECT 'notification_campaigns', 'cancelled_by', 'int'
  UNION ALL SELECT 'notification_campaigns', 'cancelled_at', 'datetime'
  UNION ALL SELECT 'notification_campaigns', 'locked_until', 'datetime'
  UNION ALL SELECT 'notification_campaigns', 'lock_token', 'char(36)'
  UNION ALL SELECT 'notification_campaigns', 'created_at', 'datetime'
  UNION ALL SELECT 'notification_campaigns', 'updated_at', 'datetime'
  UNION ALL SELECT 'notification_campaign_recipients', 'recipient_id', 'bigint'
  UNION ALL SELECT 'notification_campaign_recipients', 'campaign_id', 'bigint'
  UNION ALL SELECT 'notification_campaign_recipients', 'occurrence_no', 'int'
  UNION ALL SELECT 'notification_campaign_recipients', 'user_id', 'int'
  UNION ALL SELECT 'notification_campaign_recipients', 'language', 'enum'
  UNION ALL SELECT 'notification_campaign_recipients', 'status', 'enum'
  UNION ALL SELECT 'notification_campaign_recipients', 'skip_reason', 'varchar(60)'
  UNION ALL SELECT 'notification_campaign_recipients', 'notification_id', 'int'
  UNION ALL SELECT 'notification_campaign_recipients', 'devices_attempted', 'tinyint'
  UNION ALL SELECT 'notification_campaign_recipients', 'devices_accepted', 'tinyint'
  UNION ALL SELECT 'notification_campaign_recipients', 'image_fallback', 'tinyint'
  UNION ALL SELECT 'notification_campaign_recipients', 'attempts', 'tinyint'
  UNION ALL SELECT 'notification_campaign_recipients', 'next_attempt_at', 'datetime'
  UNION ALL SELECT 'notification_campaign_recipients', 'locked_until', 'datetime'
  UNION ALL SELECT 'notification_campaign_recipients', 'lock_token', 'char(36)'
  UNION ALL SELECT 'notification_campaign_recipients', 'last_error_code', 'varchar(100)'
  UNION ALL SELECT 'notification_campaign_recipients', 'created_at', 'datetime'
  UNION ALL SELECT 'notification_campaign_recipients', 'updated_at', 'datetime'
  UNION ALL SELECT 'notification_campaign_audit_logs', 'audit_id', 'bigint'
  UNION ALL SELECT 'notification_campaign_audit_logs', 'campaign_id', 'bigint'
  UNION ALL SELECT 'notification_campaign_audit_logs', 'actor_user_id', 'int'
  UNION ALL SELECT 'notification_campaign_audit_logs', 'actor_role', 'varchar(30)'
  UNION ALL SELECT 'notification_campaign_audit_logs', 'action', 'varchar(40)'
  UNION ALL SELECT 'notification_campaign_audit_logs', 'decision', 'enum'
  UNION ALL SELECT 'notification_campaign_audit_logs', 'details', 'json'
  UNION ALL SELECT 'notification_campaign_audit_logs', 'ip_address', 'varchar(64)'
  UNION ALL SELECT 'notification_campaign_audit_logs', 'created_at', 'datetime'
  UNION ALL SELECT 'rm_company_assignments', 'rm_user_id', 'int'
  UNION ALL SELECT 'rm_company_assignments', 'company_id', 'int'
  UNION ALL SELECT 'rm_company_assignments', 'assigned_by', 'int'
  UNION ALL SELECT 'rm_company_assignments', 'created_at', 'datetime'
  UNION ALL SELECT 'notification_push_attempts', 'attempt_id', 'bigint'
  UNION ALL SELECT 'notification_push_attempts', 'notification_id', 'int'
  UNION ALL SELECT 'notification_push_attempts', 'user_id', 'int'
  UNION ALL SELECT 'notification_push_attempts', 'push_token_id', 'bigint'
  UNION ALL SELECT 'notification_push_attempts', 'token_hash', 'char(64)'
  UNION ALL SELECT 'notification_push_attempts', 'token_preview', 'varchar(32)'
  UNION ALL SELECT 'notification_push_attempts', 'platform', 'enum'
  UNION ALL SELECT 'notification_push_attempts', 'firebase_project_id', 'varchar(100)'
  UNION ALL SELECT 'notification_push_attempts', 'attempt_no', 'tinyint'
  UNION ALL SELECT 'notification_push_attempts', 'status', 'enum'
  UNION ALL SELECT 'notification_push_attempts', 'fcm_message_id', 'varchar(255)'
  UNION ALL SELECT 'notification_push_attempts', 'error_code', 'varchar(100)'
  UNION ALL SELECT 'notification_push_attempts', 'error_message', 'varchar(500)'
  UNION ALL SELECT 'notification_push_attempts', 'created_at', 'datetime'
) e
LEFT JOIN information_schema.COLUMNS c
  ON c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = e.table_name AND c.COLUMN_NAME = e.column_name
WHERE c.COLUMN_NAME IS NULL
   OR NOT (
        LOWER(c.COLUMN_TYPE) LIKE CONCAT(e.expected_type, '%')
     OR (e.expected_type = 'json' AND LOWER(c.DATA_TYPE) IN ('json', 'longtext'))
   )
ORDER BY e.table_name, e.column_name;

-- C. JSON validation is active on MariaDB (expect one CHECK row per JSON
--    column: variables, catalog_product_ids, media, audience_filter, details).
--    On MySQL this returns no rows because native JSON validates itself.
SELECT TABLE_NAME, CONSTRAINT_NAME, CHECK_CLAUSE
FROM information_schema.CHECK_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('notification_campaigns', 'notification_campaign_audit_logs')
ORDER BY TABLE_NAME, CONSTRAINT_NAME;

-- D. Queue and idempotency indexes the scheduler relies on (expect 5 rows;
--    the two uq_ keys must show NON_UNIQUE = 0).
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_in_index
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND INDEX_NAME IN ('idx_notification_campaigns_due', 'uq_campaign_recipient', 'idx_campaign_recipients_due', 'uq_notifications_idempotency_key', 'uq_campaign_client_request')
GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE;

-- D2. Recipient status supports inbox_only (expect 1 row, has_inbox_only = 1).
SELECT COLUMN_TYPE, COLUMN_TYPE LIKE '%inbox_only%' AS has_inbox_only
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_campaign_recipients' AND COLUMN_NAME = 'status';

-- E. Protected data counts: must equal the pre-check section C exactly.
SELECT 'notification_templates' AS protected_table, COUNT(*) AS row_count, COUNT(DISTINCT template_key) AS distinct_keys FROM notification_templates
UNION ALL SELECT 'notifications', COUNT(*), MAX(notification_id) FROM notifications
UNION ALL SELECT 'user_push_tokens (active)', SUM(is_active = 1), COUNT(*) FROM user_push_tokens
UNION ALL SELECT 'notification_preferences', COUNT(*), NULL FROM notification_preferences
UNION ALL SELECT 'notification_media', COUNT(*), NULL FROM notification_media
UNION ALL SELECT 'notification_open_events', COUNT(*), NULL FROM notification_open_events;

-- F. New tables start empty (expect 0 in every row).
SELECT 'notification_campaigns' AS new_table, COUNT(*) AS row_count FROM notification_campaigns
UNION ALL SELECT 'notification_campaign_recipients', COUNT(*) FROM notification_campaign_recipients
UNION ALL SELECT 'notification_campaign_audit_logs', COUNT(*) FROM notification_campaign_audit_logs
UNION ALL SELECT 'notification_push_attempts', COUNT(*) FROM notification_push_attempts
UNION ALL SELECT 'rm_company_assignments', COUNT(*) FROM rm_company_assignments;
