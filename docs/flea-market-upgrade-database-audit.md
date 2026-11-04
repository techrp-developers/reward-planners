# Flea Market upgrade database audit

Schema snapshot only. No migrations applied.

[
  {
    "sessionTimezone": "SYSTEM",
    "globalTimezone": "SYSTEM",
    "systemTimezone": "IST",
    "databaseNow": "2026-10-16T11:35:19.000Z",
    "utcNow": "2026-10-16T06:05:19.000Z"
  }
]

## customer_wallet

```sql
CREATE TABLE `customer_wallet` (
  `wallet_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `balance` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`wallet_id`),
  UNIQUE KEY `unique_wallet_customer` (`user_id`),
  KEY `idx_wallet_user` (`user_id`),
  CONSTRAINT `customer_wallet_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `customer` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=953 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

## eproducts

```sql
CREATE TABLE `eproducts` (
  `product_id` int NOT NULL AUTO_INCREMENT,
  `vendor_id` int NOT NULL,
  `category_id` int DEFAULT NULL,
  `subcategory_id` int DEFAULT NULL,
  `sub_subcategory_id` int DEFAULT NULL,
  `brand_name` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `manufacturer` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `product_name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `gst_slab` decimal(5,2) DEFAULT NULL,
  `hsn_sac_code` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `is_discount_eligible` tinyint(1) NOT NULL DEFAULT '1',
  `is_returnable` tinyint(1) NOT NULL DEFAULT '1',
  `is_replaceable` tinyint(1) NOT NULL DEFAULT '1',
  `return_window_days` int DEFAULT NULL,
  `delivery_sla_min_days` int NOT NULL DEFAULT '1',
  `delivery_sla_max_days` int NOT NULL DEFAULT '3',
  `shipping_class` enum('standard','bulky','fragile') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'standard',
  `description` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `short_description` text COLLATE utf8mb4_general_ci,
  `brand_description` text COLLATE utf8mb4_general_ci,
  `status` enum('pending','approved','rejected','resubmission','sent_for_approval') COLLATE utf8mb4_general_ci DEFAULT 'pending',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `is_searchable` tinyint(1) NOT NULL DEFAULT '1',
  `is_visible` tinyint(1) NOT NULL DEFAULT '1',
  `rejection_reason` text COLLATE utf8mb4_general_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `custom_category` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `custom_subcategory` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `custom_sub_subcategory` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `avg_rating` decimal(2,1) DEFAULT '0.0',
  `rating_count` int DEFAULT '0',
  `created_via` enum('standard','flea_market_quick_create') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'standard',
  PRIMARY KEY (`product_id`),
  KEY `category_id` (`category_id`),
  KEY `subcategory_id` (`subcategory_id`),
  KEY `sub_subcategory_id` (`sub_subcategory_id`),
  KEY `idx_products_new_arrivals` (`status`,`is_deleted`,`is_visible`,`created_at`),
  KEY `idx_products_visibility` (`status`,`is_deleted`,`is_visible`),
  KEY `fk_products_vendor` (`vendor_id`),
  CONSTRAINT `eproducts_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`category_id`),
  CONSTRAINT `eproducts_ibfk_2` FOREIGN KEY (`subcategory_id`) REFERENCES `sub_categories` (`subcategory_id`),
  CONSTRAINT `eproducts_ibfk_3` FOREIGN KEY (`sub_subcategory_id`) REFERENCES `sub_sub_categories` (`sub_subcategory_id`),
  CONSTRAINT `fk_products_vendor` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`vendor_id`)
) ENGINE=InnoDB AUTO_INCREMENT=1315 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

## eusers

```sql
CREATE TABLE `eusers` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `role` enum('vendor','vendor_manager','admin','hr','warehouse_manager','flea_market_manager','service_partner','service_manager','rm') COLLATE utf8mb4_general_ci NOT NULL,
  `email` varchar(190) COLLATE utf8mb4_general_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `is_verified` tinyint(1) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=39 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

## flea_market_checkout_idempotency

```sql
CREATE TABLE `flea_market_checkout_idempotency` (
  `idempotency_key` varchar(80) COLLATE utf8mb4_general_ci NOT NULL,
  `session_id` varchar(64) COLLATE utf8mb4_general_ci NOT NULL,
  `invoice_ids` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `status` enum('processing','completed','failed') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'processing',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idempotency_key`),
  KEY `idx_fmci_session_id` (`session_id`),
  CONSTRAINT `fk_fmci_session` FOREIGN KEY (`session_id`) REFERENCES `flea_market_sessions` (`session_id`) ON DELETE CASCADE,
  CONSTRAINT `flea_market_checkout_idempotency_chk_1` CHECK (json_valid(`invoice_ids`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

## flea_market_locations

```sql
CREATE TABLE `flea_market_locations` (
  `location_id` int unsigned NOT NULL AUTO_INCREMENT,
  `company_id` int NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_general_ci NOT NULL,
  `address` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` enum('active','inactive') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`location_id`),
  KEY `idx_fml_company_status` (`company_id`,`status`),
  CONSTRAINT `fk_fml_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`company_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

## flea_market_operators

```sql
CREATE TABLE `flea_market_operators` (
  `operator_id` int unsigned NOT NULL AUTO_INCREMENT,
  `location_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `role` varchar(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'cashier',
  `status` enum('active','inactive') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`operator_id`),
  KEY `idx_fmo_location_status` (`location_id`,`status`),
  CONSTRAINT `fk_fmo_location` FOREIGN KEY (`location_id`) REFERENCES `flea_market_locations` (`location_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

## flea_market_schedules

```sql
CREATE TABLE `flea_market_schedules` (
  `schedule_id` int unsigned NOT NULL AUTO_INCREMENT,
  `company_id` int NOT NULL,
  `location_id` int unsigned NOT NULL,
  `scheduled_date` date NOT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `status` enum('scheduled','in_progress','completed','cancelled') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'scheduled',
  `notes` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`schedule_id`),
  KEY `idx_date_status` (`scheduled_date`,`status`),
  KEY `idx_company` (`company_id`),
  KEY `idx_location` (`location_id`),
  CONSTRAINT `fk_fmsch_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`company_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fmsch_location` FOREIGN KEY (`location_id`) REFERENCES `flea_market_locations` (`location_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

## flea_market_sessions

```sql
CREATE TABLE `flea_market_sessions` (
  `session_id` varchar(64) COLLATE utf8mb4_general_ci NOT NULL,
  `user_id` int NOT NULL,
  `company_id` int NOT NULL,
  `location_id` int unsigned NOT NULL,
  `operator_id` int unsigned DEFAULT NULL,
  `otp_verified_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `status` enum('active','completed','expired') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`session_id`),
  KEY `fk_fms_user` (`user_id`),
  KEY `fk_fms_company` (`company_id`),
  KEY `fk_fms_location` (`location_id`),
  KEY `fk_fms_operator` (`operator_id`),
  CONSTRAINT `fk_fms_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`company_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fms_location` FOREIGN KEY (`location_id`) REFERENCES `flea_market_locations` (`location_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fms_operator` FOREIGN KEY (`operator_id`) REFERENCES `flea_market_operators` (`operator_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fms_user` FOREIGN KEY (`user_id`) REFERENCES `customer` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

## flea_market_stock_allocations_archive

```sql
CREATE TABLE `flea_market_stock_allocations_archive` (
  `allocation_id` int NOT NULL AUTO_INCREMENT,
  `schedule_id` int unsigned NOT NULL,
  `vendor_id` int NOT NULL,
  `product_id` int NOT NULL,
  `variant_id` int NOT NULL,
  `allocated_qty` int NOT NULL,
  `sold_qty` int NOT NULL DEFAULT '0',
  `damaged_qty` int NOT NULL DEFAULT '0',
  `returned_qty` int NOT NULL DEFAULT '0',
  `available_qty` int GENERATED ALWAYS AS (((`allocated_qty` - `sold_qty`) - `damaged_qty`)) STORED,
  `allocation_price` decimal(10,2) DEFAULT NULL,
  `status` enum('allocated','active','completed','closed') NOT NULL DEFAULT 'allocated',
  `allocated_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`allocation_id`),
  UNIQUE KEY `uniq_event_product` (`schedule_id`,`vendor_id`,`variant_id`),
  KEY `idx_fmsa_schedule` (`schedule_id`),
  KEY `idx_fmsa_vendor` (`vendor_id`),
  KEY `idx_fmsa_variant` (`variant_id`),
  KEY `fk_fmsa_product` (`product_id`),
  CONSTRAINT `fk_fmsa_product` FOREIGN KEY (`product_id`) REFERENCES `eproducts` (`product_id`),
  CONSTRAINT `fk_fmsa_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `flea_market_schedules` (`schedule_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_fmsa_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`variant_id`),
  CONSTRAINT `fk_fmsa_vendor` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`vendor_id`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;
```

## flea_market_stock_logs

```sql
CREATE TABLE `flea_market_stock_logs` (
  `log_id` int NOT NULL AUTO_INCREMENT,
  `pool_id` int NOT NULL,
  `schedule_id` int unsigned DEFAULT NULL,
  `action` enum('allocated','sale','return','damage','adjustment') NOT NULL,
  `quantity` int NOT NULL,
  `remarks` varchar(255) DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `fk_logs_pool` (`pool_id`),
  KEY `fk_logs_schedule` (`schedule_id`),
  CONSTRAINT `fk_logs_pool` FOREIGN KEY (`pool_id`) REFERENCES `flea_market_vendor_stock` (`pool_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_logs_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `flea_market_schedules` (`schedule_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=147 DEFAULT CHARSET=latin1;
```

## flea_market_vendor_stock

```sql
CREATE TABLE `flea_market_vendor_stock` (
  `pool_id` int NOT NULL AUTO_INCREMENT,
  `vendor_id` int NOT NULL,
  `product_id` int NOT NULL,
  `variant_id` int NOT NULL,
  `allocated_qty` int NOT NULL DEFAULT '0',
  `sold_qty` int NOT NULL DEFAULT '0',
  `damaged_qty` int NOT NULL DEFAULT '0',
  `returned_qty` int NOT NULL DEFAULT '0',
  `available_qty` int GENERATED ALWAYS AS ((((`allocated_qty` - `sold_qty`) - `damaged_qty`) - `returned_qty`)) STORED,
  `allocation_price` decimal(10,2) DEFAULT NULL,
  `status` enum('active','closed') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'active',
  `allocated_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`pool_id`),
  UNIQUE KEY `uniq_vendor_variant_pool` (`vendor_id`,`variant_id`),
  KEY `idx_fvs_vendor` (`vendor_id`),
  KEY `idx_fvs_variant` (`variant_id`),
  KEY `fk_fvs_product` (`product_id`),
  CONSTRAINT `fk_fvs_product` FOREIGN KEY (`product_id`) REFERENCES `eproducts` (`product_id`),
  CONSTRAINT `fk_fvs_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`variant_id`),
  CONSTRAINT `fk_fvs_vendor` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`vendor_id`)
) ENGINE=InnoDB AUTO_INCREMENT=153 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

## invoice_items

```sql
CREATE TABLE `invoice_items` (
  `invoice_item_id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int NOT NULL,
  `product_id` int NOT NULL,
  `variant_id` int NOT NULL,
  `product_name` varchar(255) DEFAULT NULL,
  `sku` varchar(100) DEFAULT NULL,
  `quantity` int NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `tax_rate` decimal(5,2) DEFAULT '0.00',
  `hsn_code` varchar(20) DEFAULT NULL,
  `cgst_amount` decimal(10,2) DEFAULT '0.00',
  `sgst_amount` decimal(10,2) DEFAULT '0.00',
  `igst_amount` decimal(10,2) DEFAULT '0.00',
  `line_total` decimal(10,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`invoice_item_id`),
  KEY `invoice_id` (`invoice_id`)
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=latin1;
```

## invoices

```sql
CREATE TABLE `invoices` (
  `invoice_id` int NOT NULL AUTO_INCREMENT,
  `invoice_number` varchar(100) NOT NULL,
  `order_id` int NOT NULL,
  `vendor_id` int NOT NULL,
  `user_id` int NOT NULL,
  `subtotal` decimal(10,2) NOT NULL DEFAULT '0.00',
  `tax_total` decimal(10,2) DEFAULT '0.00',
  `shipping_amount` decimal(10,2) DEFAULT '0.00',
  `reward_discount` decimal(10,2) DEFAULT '0.00',
  `grand_total` decimal(10,2) NOT NULL,
  `invoice_status` enum('generated','cancelled') DEFAULT 'generated',
  `invoice_date` datetime DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `source` enum('ecommerce','flea_market') NOT NULL DEFAULT 'ecommerce',
  `location_id` int unsigned DEFAULT NULL,
  `session_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `schedule_id` int unsigned DEFAULT NULL,
  PRIMARY KEY (`invoice_id`),
  UNIQUE KEY `invoice_number` (`invoice_number`),
  KEY `order_id` (`order_id`),
  KEY `vendor_id` (`vendor_id`),
  KEY `fk_invoices_fm_location` (`location_id`),
  KEY `fk_invoices_fm_session` (`session_id`),
  KEY `idx_invoices_fm_schedule` (`schedule_id`),
  CONSTRAINT `fk_invoices_fm_location` FOREIGN KEY (`location_id`) REFERENCES `flea_market_locations` (`location_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_invoices_fm_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `flea_market_schedules` (`schedule_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_invoices_fm_session` FOREIGN KEY (`session_id`) REFERENCES `flea_market_sessions` (`session_id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=37 DEFAULT CHARSET=latin1;
```

## product_variants

```sql
CREATE TABLE `product_variants` (
  `variant_id` int NOT NULL AUTO_INCREMENT,
  `sku` varchar(190) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `product_id` int NOT NULL,
  `variant_attributes` longtext COLLATE utf8mb4_general_ci NOT NULL,
  `mrp` decimal(10,2) DEFAULT NULL,
  `sale_price` decimal(10,2) DEFAULT NULL,
  `stock` int DEFAULT '0',
  `is_visible` tinyint(1) NOT NULL DEFAULT '1',
  `manufacturing_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `weight` decimal(8,3) DEFAULT NULL,
  `length` decimal(8,2) DEFAULT NULL,
  `breadth` decimal(8,2) DEFAULT NULL,
  `height` decimal(8,2) DEFAULT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`variant_id`),
  UNIQUE KEY `sku` (`sku`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `product_variants_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `eproducts` (`product_id`)
) ENGINE=InnoDB AUTO_INCREMENT=1504 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

## vendors

```sql
CREATE TABLE `vendors` (
  `vendor_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `company_name` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `full_name` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `vendor_type` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `gstin` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ipaddress` varchar(45) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `pan_number` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `status` enum('pending','sent_for_approval','approved','rejected','resubmission','deleted') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'pending',
  `onboarding_flag` tinyint(1) NOT NULL DEFAULT '0',
  `rejection_reason` text COLLATE utf8mb4_general_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`vendor_id`),
  UNIQUE KEY `uniq_user_vendor` (`user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `vendors_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `eusers` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=30 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

## wallet_transactions

```sql
CREATE TABLE `wallet_transactions` (
  `transaction_id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `title` varchar(150) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `transaction_type` enum('credit','debit') NOT NULL,
  `coins` int NOT NULL,
  `balance_after` int DEFAULT NULL,
  `category` enum('steps','order','reward','referral','admin') DEFAULT 'reward',
  `reference_id` int DEFAULT NULL,
  `expiry_date` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `reason_code` enum('ORDER_REWARD','REFERRAL_BONUS','ADMIN_ADJUSTMENT','REDEEM','EXPIRY','ORDER_REFUND','SHIPMENT_REWARD_REFUND','ORDER_REWARD_REVERSAL','SHIPMENT_REWARD_REVERSAL') DEFAULT 'ORDER_REWARD',
  PRIMARY KEY (`transaction_id`),
  UNIQUE KEY `uniq_wallet_order_reward` (`user_id`,`transaction_type`,`reason_code`,`reference_id`),
  KEY `idx_wallet_user` (`user_id`),
  KEY `idx_wallet_type` (`transaction_type`),
  KEY `idx_expiry` (`expiry_date`),
  CONSTRAINT `wallet_transactions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `customer` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=270 DEFAULT CHARSET=latin1;
```

Historical invoice existence/status baseline:
```json
[
  {
    "invoice_id": 34,
    "source": "flea_market",
    "invoice_status": "generated"
  },
  {
    "invoice_id": 35,
    "source": "flea_market",
    "invoice_status": "generated"
  },
  {
    "invoice_id": 36,
    "source": "flea_market",
    "invoice_status": "generated"
  }
]
```
