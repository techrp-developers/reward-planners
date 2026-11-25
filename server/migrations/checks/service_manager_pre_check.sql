-- READ ONLY. Inspect before deployment; do not classify data based on names.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN
('eusers','services','service_categories','service_variants','service_orders',
 'service_enquiries','wallet_transactions','service_manager_audit_logs')
ORDER BY TABLE_NAME, ORDINAL_POSITION;
SELECT s.id FROM services s LEFT JOIN service_categories c ON c.id=s.category_id WHERE c.id IS NULL;
SELECT v.id FROM service_variants v LEFT JOIN services s ON s.id=v.service_id WHERE s.id IS NULL;
SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_in_index
FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
AND TABLE_NAME IN ('service_orders','wallet_transactions','service_variants')
GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE;
-- Required for reward issuing: reason_code must support SERVICE_REWARD and
-- idempotency index must cover (reason_code, reference_id, transaction_type).
-- Also reconcile missing flash_sale_campaign_id in the local service_orders
-- schema against the existing deployment's CMS/flash sale migrations.
