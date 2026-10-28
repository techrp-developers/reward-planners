-- =====================================================================
-- READ-ONLY pre-migration check (SELECT statements only).
-- Run in phpMyAdmin on rewardplanners_db BEFORE the three migrations and
-- keep the results: the post-check compares the protected counts.
-- =====================================================================

-- A. Server engine and version (expected here: 10.4.32-MariaDB).
SELECT VERSION() AS server_version, @@version_comment AS server_comment, DATABASE() AS current_database;

-- B. Which notification objects exist right now.
SELECT t.table_name AS expected_table,
       IF(i.TABLE_NAME IS NULL, 'missing', 'exists') AS state
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
ORDER BY state DESC, expected_table;

-- C. Protected data counts (must be identical after the migrations).
SELECT 'notification_templates' AS protected_table, COUNT(*) AS row_count, COUNT(DISTINCT template_key) AS distinct_keys FROM notification_templates
UNION ALL SELECT 'notifications', COUNT(*), MAX(notification_id) FROM notifications
UNION ALL SELECT 'user_push_tokens (active)', SUM(is_active = 1), COUNT(*) FROM user_push_tokens
UNION ALL SELECT 'notification_preferences', COUNT(*), NULL FROM notification_preferences
UNION ALL SELECT 'notification_media', COUNT(*), NULL FROM notification_media
UNION ALL SELECT 'notification_open_events', COUNT(*), NULL FROM notification_open_events;

-- D. Existing tables the migrations reuse must already match the backend
--    (expect 15 rows for notification_media and 8 for notification_open_events,
--    with column_matches = 'yes' on every row).
SELECT e.table_name, e.column_name, e.expected_type,
       c.COLUMN_TYPE AS actual_type,
       IF(c.COLUMN_NAME IS NULL, 'MISSING', IF(LOWER(c.COLUMN_TYPE) LIKE CONCAT(e.expected_type, '%'), 'yes', 'TYPE DIFFERS')) AS column_matches
FROM (
  SELECT 'notification_media' AS table_name, 'media_id' AS column_name, 'bigint' AS expected_type
  UNION ALL SELECT 'notification_media', 'source', 'enum'
  UNION ALL SELECT 'notification_media', 'source_ref_id', 'varchar(64)'
  UNION ALL SELECT 'notification_media', 'label', 'varchar(150)'
  UNION ALL SELECT 'notification_media', 'language', 'enum'
  UNION ALL SELECT 'notification_media', 'storage_key', 'varchar(500)'
  UNION ALL SELECT 'notification_media', 'public_url', 'varchar(600)'
  UNION ALL SELECT 'notification_media', 'mime_type', 'varchar(40)'
  UNION ALL SELECT 'notification_media', 'width', 'smallint'
  UNION ALL SELECT 'notification_media', 'height', 'smallint'
  UNION ALL SELECT 'notification_media', 'bytes', 'int'
  UNION ALL SELECT 'notification_media', 'status', 'enum'
  UNION ALL SELECT 'notification_media', 'created_by', 'int'
  UNION ALL SELECT 'notification_media', 'created_by_role', 'varchar(30)'
  UNION ALL SELECT 'notification_media', 'created_at', 'datetime'
  UNION ALL SELECT 'notification_open_events', 'open_id', 'bigint'
  UNION ALL SELECT 'notification_open_events', 'notification_id', 'int'
  UNION ALL SELECT 'notification_open_events', 'user_id', 'int'
  UNION ALL SELECT 'notification_open_events', 'campaign_id', 'bigint'
  UNION ALL SELECT 'notification_open_events', 'app_state', 'enum'
  UNION ALL SELECT 'notification_open_events', 'outcome', 'enum'
  UNION ALL SELECT 'notification_open_events', 'destination_type', 'varchar(40)'
  UNION ALL SELECT 'notification_open_events', 'opened_at', 'datetime'
) e
LEFT JOIN information_schema.COLUMNS c
  ON c.TABLE_SCHEMA = DATABASE() AND c.TABLE_NAME = e.table_name AND c.COLUMN_NAME = e.column_name
ORDER BY e.table_name, e.column_name;

-- E. Required unique key on notification_open_events (one open per notification).
SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_in_index
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notification_open_events'
GROUP BY INDEX_NAME, NON_UNIQUE;
