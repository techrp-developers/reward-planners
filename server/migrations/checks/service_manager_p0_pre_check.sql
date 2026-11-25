-- READ ONLY. Do not automatically remediate or classify these results.
SELECT VERSION(),DATABASE(),@@session.sql_mode;
SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()
AND TABLE_NAME IN ('campaigns','campaign_service_items','wallet_transactions','service_order_refunds')
ORDER BY TABLE_NAME,ORDINAL_POSITION;
SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_in_index
FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()
AND TABLE_NAME IN ('wallet_transactions','campaigns','service_order_refunds')
GROUP BY TABLE_NAME,INDEX_NAME,NON_UNIQUE;
SELECT transaction_id,user_id,transaction_type,coins,reference_id,title,created_at
FROM wallet_transactions WHERE reason_code='';
SELECT service_order_id,refund_method,COUNT(*) AS duplicates FROM service_order_refunds
WHERE service_order_id IS NOT NULL GROUP BY service_order_id,refund_method HAVING COUNT(*)>1;
SELECT razorpay_refund_id,COUNT(*) AS duplicates FROM service_order_refunds
WHERE razorpay_refund_id IS NOT NULL GROUP BY razorpay_refund_id HAVING COUNT(*)>1;
SELECT o.id,o.order_ref,o.user_id,o.address_id,o.created_at FROM service_orders o
LEFT JOIN customer_addresses a ON a.address_id=o.address_id
WHERE o.address_id IS NOT NULL AND a.address_id IS NULL;
SELECT id,name,service_scope FROM service_categories ORDER BY id;
SELECT id,name,category_id,service_scope FROM services ORDER BY id;
