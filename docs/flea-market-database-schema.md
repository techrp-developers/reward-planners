# Flea Market database schema reference

Verified from the configured database on 2026-10-16. Schema only; no account or customer records.

These tables are referenced by the Flea Market module or its shared authentication/reward dependencies. Not every shared-table column is used by this module. PK = primary key, UNI = unique index participation, MUL = nonunique index participation; foreign keys are listed separately.

Stock pools persist across events. available_qty is generated as allocated_qty - sold_qty - damaged_qty - returned_qty. Do not insert/update it directly. Flea Market invoices use source = flea_market. Customer user_id and eusers user_id belong to separate identity tables. Legacy flea_market_stock_allocations is replaced by flea_market_vendor_stock in the current workflow.

## eusers

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| user_id | int | NO | PRI | NULL / none | auto_increment |
| name | varchar(255) | NO | — | NULL / none | — |
| role | enum('vendor','vendor_manager','admin','hr','warehouse_manager','flea_market_manager','service_partner','service_manager','rm') | NO | — | NULL / none | — |
| email | varchar(190) | NO | UNI | NULL / none | — |
| password | varchar(255) | YES | — | NULL / none | — |
| phone | varchar(20) | YES | — | NULL / none | — |
| is_verified | tinyint(1) | YES | — | 0 | — |
| created_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

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

</details>

## companies

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| company_id | int | NO | PRI | NULL / none | auto_increment |
| company_name | varchar(255) | NO | — | NULL / none | — |
| company_email | varchar(255) | YES | — | NULL / none | — |
| company_phone | varchar(20) | YES | — | NULL / none | — |
| company_logo | varchar(500) | YES | — | NULL / none | — |
| status | tinyint(1) | YES | — | 1 | — |
| created_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

```sql
CREATE TABLE `companies` (
  `company_id` int NOT NULL AUTO_INCREMENT,
  `company_name` varchar(255) NOT NULL,
  `company_email` varchar(255) DEFAULT NULL,
  `company_phone` varchar(20) DEFAULT NULL,
  `company_logo` varchar(500) DEFAULT NULL,
  `status` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`company_id`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=latin1;
```

</details>

## flea_market_locations

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| location_id | int unsigned | NO | PRI | NULL / none | auto_increment |
| company_id | int | NO | MUL | NULL / none | — |
| name | varchar(150) | NO | — | NULL / none | — |
| address | varchar(500) | YES | — | NULL / none | — |
| status | enum('active','inactive') | NO | — | active | — |
| created_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

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

</details>

## flea_market_schedules

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| schedule_id | int unsigned | NO | PRI | NULL / none | auto_increment |
| company_id | int | NO | MUL | NULL / none | — |
| location_id | int unsigned | NO | MUL | NULL / none | — |
| scheduled_date | date | NO | MUL | NULL / none | — |
| start_time | time | YES | — | NULL / none | — |
| end_time | time | YES | — | NULL / none | — |
| status | enum('scheduled','in_progress','completed','cancelled') | NO | — | scheduled | — |
| notes | varchar(255) | YES | — | NULL / none | — |
| created_by | int | YES | — | NULL / none | — |
| created_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

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

</details>

## vendors

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| vendor_id | int | NO | PRI | NULL / none | auto_increment |
| user_id | int | NO | UNI | NULL / none | — |
| company_name | varchar(255) | YES | — | NULL / none | — |
| full_name | varchar(255) | YES | — | NULL / none | — |
| vendor_type | varchar(100) | YES | — | NULL / none | — |
| gstin | varchar(30) | YES | — | NULL / none | — |
| ipaddress | varchar(45) | YES | — | NULL / none | — |
| pan_number | varchar(20) | YES | — | NULL / none | — |
| status | enum('pending','sent_for_approval','approved','rejected','resubmission','deleted') | NO | — | pending | — |
| onboarding_flag | tinyint(1) | NO | — | 0 | — |
| rejection_reason | text | YES | — | NULL / none | — |
| created_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | YES | — | NULL / none | on update CURRENT_TIMESTAMP |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

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

</details>

## vendor_contacts

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| contact_id | int | NO | PRI | NULL / none | auto_increment |
| vendor_id | int | NO | MUL | NULL / none | — |
| primary_contact | varchar(20) | YES | — | NULL / none | — |
| alternate_contact | varchar(20) | YES | — | NULL / none | — |
| email | varchar(255) | YES | — | NULL / none | — |
| payment_terms | text | YES | — | NULL / none | — |
| comments | text | YES | — | NULL / none | — |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

```sql
CREATE TABLE `vendor_contacts` (
  `contact_id` int NOT NULL AUTO_INCREMENT,
  `vendor_id` int NOT NULL,
  `primary_contact` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `alternate_contact` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `payment_terms` text COLLATE utf8mb4_general_ci,
  `comments` text COLLATE utf8mb4_general_ci,
  PRIMARY KEY (`contact_id`),
  KEY `vendor_id` (`vendor_id`),
  CONSTRAINT `vendor_contacts_ibfk_1` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`vendor_id`)
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

</details>

## eproducts

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| product_id | int | NO | PRI | NULL / none | auto_increment |
| vendor_id | int | NO | MUL | NULL / none | — |
| category_id | int | YES | MUL | NULL / none | — |
| subcategory_id | int | YES | MUL | NULL / none | — |
| sub_subcategory_id | int | YES | MUL | NULL / none | — |
| brand_name | varchar(255) | YES | — | NULL / none | — |
| manufacturer | varchar(255) | YES | — | NULL / none | — |
| product_name | varchar(255) | NO | — | NULL / none | — |
| gst_slab | decimal(5,2) | YES | — | NULL / none | — |
| hsn_sac_code | varchar(20) | YES | — | NULL / none | — |
| is_discount_eligible | tinyint(1) | NO | — | 1 | — |
| is_returnable | tinyint(1) | NO | — | 1 | — |
| is_replaceable | tinyint(1) | NO | — | 1 | — |
| return_window_days | int | YES | — | NULL / none | — |
| delivery_sla_min_days | int | NO | — | 1 | — |
| delivery_sla_max_days | int | NO | — | 3 | — |
| shipping_class | enum('standard','bulky','fragile') | NO | — | standard | — |
| description | longtext | YES | — | NULL / none | — |
| short_description | text | YES | — | NULL / none | — |
| brand_description | text | YES | — | NULL / none | — |
| status | enum('pending','approved','rejected','resubmission','sent_for_approval') | YES | MUL | pending | — |
| is_deleted | tinyint(1) | NO | — | 0 | — |
| is_searchable | tinyint(1) | NO | — | 1 | — |
| is_visible | tinyint(1) | NO | — | 1 | — |
| rejection_reason | text | YES | — | NULL / none | — |
| created_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| custom_category | varchar(255) | YES | — | NULL / none | — |
| custom_subcategory | varchar(255) | YES | — | NULL / none | — |
| custom_sub_subcategory | varchar(255) | YES | — | NULL / none | — |
| avg_rating | decimal(2,1) | YES | — | 0.0 | — |
| rating_count | int | YES | — | 0 | — |
| created_via | enum('standard','flea_market_quick_create') | NO | — | standard | — |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

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

</details>

## product_variants

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| variant_id | int | NO | PRI | NULL / none | auto_increment |
| sku | varchar(190) | YES | UNI | NULL / none | — |
| product_id | int | NO | MUL | NULL / none | — |
| variant_attributes | longtext | NO | — | NULL / none | — |
| mrp | decimal(10,2) | YES | — | NULL / none | — |
| sale_price | decimal(10,2) | YES | — | NULL / none | — |
| stock | int | YES | — | 0 | — |
| is_visible | tinyint(1) | NO | — | 1 | — |
| manufacturing_date | date | YES | — | NULL / none | — |
| expiry_date | date | YES | — | NULL / none | — |
| created_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| weight | decimal(8,3) | YES | — | NULL / none | — |
| length | decimal(8,2) | YES | — | NULL / none | — |
| breadth | decimal(8,2) | YES | — | NULL / none | — |
| height | decimal(8,2) | YES | — | NULL / none | — |
| updated_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

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

</details>

## product_images

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| image_id | int | NO | PRI | NULL / none | auto_increment |
| product_id | int | NO | MUL | NULL / none | — |
| image_url | varchar(500) | NO | — | NULL / none | — |
| type | enum('gallery','banner','info','benefit','packaging','other') | YES | — | gallery | — |
| sort_order | int | YES | — | 0 | — |
| created_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

```sql
CREATE TABLE `product_images` (
  `image_id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `image_url` varchar(500) COLLATE utf8mb4_general_ci NOT NULL,
  `type` enum('gallery','banner','info','benefit','packaging','other') COLLATE utf8mb4_general_ci DEFAULT 'gallery',
  `sort_order` int DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`image_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `product_images_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `eproducts` (`product_id`)
) ENGINE=InnoDB AUTO_INCREMENT=1238 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

</details>

## reward_rules

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| reward_rule_id | int | NO | PRI | NULL / none | auto_increment |
| name | varchar(100) | YES | — | NULL / none | — |
| reward_type | enum('fixed','percentage') | NO | — | NULL / none | — |
| reward_value | decimal(10,2) | NO | — | NULL / none | — |
| redemption_type | enum('percentage','fixed') | YES | — | NULL / none | — |
| redemption_value | decimal(10,2) | YES | — | NULL / none | — |
| max_redemption_amount | decimal(10,2) | YES | — | NULL / none | — |
| max_reward | decimal(10,2) | YES | — | NULL / none | — |
| min_order_amount | decimal(10,2) | YES | — | 0.00 | — |
| max_order_amount | decimal(10,2) | YES | — | NULL / none | — |
| is_active | tinyint(1) | YES | MUL | 1 | — |
| created_at | timestamp | YES | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| source_type | enum('product','service','payment','steps','referral','onboarding','admin') | NO | — | NULL / none | — |
| description | text | YES | — | NULL / none | — |
| start_date | datetime | YES | — | NULL / none | — |
| end_date | datetime | YES | — | NULL / none | — |
| priority | int | YES | — | 1 | — |
| is_stackable | tinyint(1) | YES | — | 0 | — |
| expiry_days | int | YES | — | 90 | — |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

```sql
CREATE TABLE `reward_rules` (
  `reward_rule_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) DEFAULT NULL,
  `reward_type` enum('fixed','percentage') NOT NULL,
  `reward_value` decimal(10,2) NOT NULL,
  `redemption_type` enum('percentage','fixed') DEFAULT NULL,
  `redemption_value` decimal(10,2) DEFAULT NULL,
  `max_redemption_amount` decimal(10,2) DEFAULT NULL,
  `max_reward` decimal(10,2) DEFAULT NULL,
  `min_order_amount` decimal(10,2) DEFAULT '0.00',
  `max_order_amount` decimal(10,2) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `source_type` enum('product','service','payment','steps','referral','onboarding','admin') NOT NULL,
  `description` text,
  `start_date` datetime DEFAULT NULL,
  `end_date` datetime DEFAULT NULL,
  `priority` int DEFAULT '1',
  `is_stackable` tinyint(1) DEFAULT '0',
  `expiry_days` int DEFAULT '90',
  PRIMARY KEY (`reward_rule_id`),
  KEY `idx_active_rules` (`is_active`,`source_type`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=latin1;
```

</details>

## product_reward_settings

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL / none | auto_increment |
| product_id | int | YES | MUL | NULL / none | — |
| variant_id | int | YES | MUL | NULL / none | — |
| reward_rule_id | int | YES | MUL | NULL / none | — |
| can_earn_reward | tinyint(1) | YES | — | 0 | — |
| can_redeem_reward | tinyint(1) | YES | — | 0 | — |
| created_at | timestamp | YES | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| is_active | tinyint(1) | YES | MUL | 1 | — |
| priority | int | YES | — | 1 | — |
| category_id | int | YES | MUL | NULL / none | — |
| subcategory_id | int | YES | MUL | NULL / none | — |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

```sql
CREATE TABLE `product_reward_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int DEFAULT NULL,
  `variant_id` int DEFAULT NULL,
  `reward_rule_id` int DEFAULT NULL,
  `can_earn_reward` tinyint(1) DEFAULT '0',
  `can_redeem_reward` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `is_active` tinyint(1) DEFAULT '1',
  `priority` int DEFAULT '1',
  `category_id` int DEFAULT NULL,
  `subcategory_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `reward_rule_id` (`reward_rule_id`),
  KEY `idx_active` (`is_active`),
  KEY `idx_lookup_variant` (`variant_id`,`is_active`),
  KEY `idx_lookup_product` (`product_id`,`is_active`),
  KEY `idx_lookup_subcategory` (`subcategory_id`,`is_active`),
  KEY `idx_lookup_category` (`category_id`,`is_active`),
  CONSTRAINT `fk_prs_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`category_id`),
  CONSTRAINT `fk_prs_subcategory` FOREIGN KEY (`subcategory_id`) REFERENCES `sub_categories` (`subcategory_id`),
  CONSTRAINT `product_reward_settings_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `eproducts` (`product_id`),
  CONSTRAINT `product_reward_settings_ibfk_2` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`variant_id`),
  CONSTRAINT `product_reward_settings_ibfk_3` FOREIGN KEY (`reward_rule_id`) REFERENCES `reward_rules` (`reward_rule_id`)
) ENGINE=InnoDB AUTO_INCREMENT=134 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

</details>

## flea_market_vendor_stock

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| pool_id | int | NO | PRI | NULL / none | auto_increment |
| vendor_id | int | NO | MUL | NULL / none | — |
| product_id | int | NO | MUL | NULL / none | — |
| variant_id | int | NO | MUL | NULL / none | — |
| allocated_qty | int | NO | — | 0 | — |
| sold_qty | int | NO | — | 0 | — |
| damaged_qty | int | NO | — | 0 | — |
| returned_qty | int | NO | — | 0 | — |
| available_qty | int | YES | — | NULL / none | STORED GENERATED |
| allocation_price | decimal(10,2) | YES | — | NULL / none | — |
| status | enum('active','closed') | NO | — | active | — |
| allocated_by | int | YES | — | NULL / none | — |
| created_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

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

</details>

## flea_market_stock_logs

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| log_id | int | NO | PRI | NULL / none | auto_increment |
| pool_id | int | NO | MUL | NULL / none | — |
| schedule_id | int unsigned | YES | MUL | NULL / none | — |
| action | enum('allocated','sale','return','damage','adjustment') | NO | — | NULL / none | — |
| quantity | int | NO | — | NULL / none | — |
| remarks | varchar(255) | YES | — | NULL / none | — |
| created_by | int | YES | — | NULL / none | — |
| created_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

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

</details>

## customer

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| user_id | int | NO | PRI | NULL / none | auto_increment |
| company_id | int | YES | MUL | NULL / none | — |
| company_user_id | int | YES | MUL | NULL / none | — |
| name | varchar(255) | NO | — | NULL / none | — |
| email | varchar(255) | YES | UNI | NULL / none | — |
| phone | varchar(20) | YES | — | NULL / none | — |
| password | varchar(255) | NO | — | NULL / none | — |
| status | tinyint(1) | YES | MUL | 1 | — |
| is_verified | tinyint(1) | YES | — | 0 | — |
| last_login_at | datetime | YES | — | NULL / none | — |
| last_login_ip | varchar(45) | YES | — | NULL / none | — |
| device_id | varchar(255) | YES | MUL | NULL / none | — |
| device_name | varchar(50) | YES | — | NULL / none | — |
| fcm_token | varchar(255) | YES | MUL | NULL / none | — |
| device_platform | enum('android','ios') | YES | — | NULL / none | — |
| user_image | varchar(255) | YES | — | NULL / none | — |
| created_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| terms_accepted | tinyint(1) | YES | — | 0 | — |
| fitness_onboarding_done | tinyint(1) | YES | — | 0 | — |
| deleted_at | datetime | YES | — | NULL / none | — |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

```sql
CREATE TABLE `customer` (
  `user_id` int NOT NULL AUTO_INCREMENT,
  `company_id` int DEFAULT NULL,
  `company_user_id` int DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `status` tinyint(1) DEFAULT '1',
  `is_verified` tinyint(1) DEFAULT '0',
  `last_login_at` datetime DEFAULT NULL,
  `last_login_ip` varchar(45) DEFAULT NULL,
  `device_id` varchar(255) DEFAULT NULL,
  `device_name` varchar(50) DEFAULT NULL,
  `fcm_token` varchar(255) DEFAULT NULL,
  `device_platform` enum('android','ios') DEFAULT NULL,
  `user_image` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `terms_accepted` tinyint(1) DEFAULT '0',
  `fitness_onboarding_done` tinyint(1) DEFAULT '0',
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_customer_company_user` (`company_user_id`),
  KEY `idx_device_id` (`device_id`),
  KEY `idx_fcm_token` (`fcm_token`),
  KEY `idx_customer_company_device_platform` (`company_id`,`device_platform`),
  KEY `idx_customer_status_deleted_at` (`status`,`deleted_at`),
  CONSTRAINT `fk_customer_company_user` FOREIGN KEY (`company_user_id`) REFERENCES `company_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=184 DEFAULT CHARSET=latin1;
```

</details>

## company_users

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL / none | auto_increment |
| company_id | int | NO | MUL | NULL / none | — |
| name | varchar(100) | NO | — | NULL / none | — |
| date_of_joining | date | YES | MUL | NULL / none | — |
| email | varchar(100) | YES | — | NULL / none | — |
| contact | varchar(20) | YES | — | NULL / none | — |
| address1 | varchar(255) | YES | — | NULL / none | — |
| address2 | varchar(255) | YES | — | NULL / none | — |
| role | varchar(50) | YES | — | NULL / none | — |
| dob | date | YES | — | NULL / none | — |
| department | varchar(50) | YES | MUL | NULL / none | — |
| reporting_manager | varchar(100) | YES | — | NULL / none | — |
| ctc | decimal(15,2) | YES | — | NULL / none | — |
| status | tinyint(1) | NO | — | 1 | — |
| created_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

```sql
CREATE TABLE `company_users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `company_id` int NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `date_of_joining` date DEFAULT NULL,
  `email` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `contact` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `address1` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `address2` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `role` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `dob` date DEFAULT NULL,
  `department` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `reporting_manager` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ctc` decimal(15,2) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_company_email` (`company_id`,`email`),
  KEY `idx_company` (`company_id`),
  KEY `idx_department` (`department`),
  KEY `idx_joining_date` (`date_of_joining`),
  CONSTRAINT `fk_company_users_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`company_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1414 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

</details>

## whatsapp_otps

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| id | bigint unsigned | NO | PRI | NULL / none | auto_increment |
| phone | varchar(20) | NO | MUL | NULL / none | — |
| purpose | varchar(50) | NO | — | verify | — |
| otp_hash | varchar(100) | NO | — | NULL / none | — |
| attempts | int | NO | — | 0 | — |
| max_attempts | int | NO | — | 5 | — |
| created_at | datetime | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| expires_at | datetime | NO | — | NULL / none | — |
| last_sent_at | datetime | NO | — | NULL / none | — |
| locked_until | datetime | YES | — | NULL / none | — |
| status | enum('pending','verified','expired','blocked') | NO | — | pending | — |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

```sql
CREATE TABLE `whatsapp_otps` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `phone` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `purpose` varchar(50) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'verify',
  `otp_hash` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `attempts` int NOT NULL DEFAULT '0',
  `max_attempts` int NOT NULL DEFAULT '5',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime NOT NULL,
  `last_sent_at` datetime NOT NULL,
  `locked_until` datetime DEFAULT NULL,
  `status` enum('pending','verified','expired','blocked') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'pending',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_phone_purpose` (`phone`,`purpose`)
) ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

</details>

## email_otps

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| id | int | NO | PRI | NULL / none | auto_increment |
| email | varchar(255) | NO | MUL | NULL / none | — |
| otp | varchar(255) | NO | — | NULL / none | — |
| expiry | datetime | NO | — | NULL / none | — |
| attempt_count | int | YES | — | 0 | — |
| is_verified | tinyint(1) | YES | — | 0 | — |
| created_at | timestamp | YES | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

```sql
CREATE TABLE `email_otps` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `otp` varchar(255) NOT NULL,
  `expiry` datetime NOT NULL,
  `attempt_count` int DEFAULT '0',
  `is_verified` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=431 DEFAULT CHARSET=latin1;
```

</details>

## flea_market_sessions

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| session_id | varchar(64) | NO | PRI | NULL / none | — |
| user_id | int | NO | MUL | NULL / none | — |
| company_id | int | NO | MUL | NULL / none | — |
| location_id | int unsigned | NO | MUL | NULL / none | — |
| operator_id | int unsigned | YES | MUL | NULL / none | — |
| otp_verified_at | timestamp | YES | — | NULL / none | — |
| expires_at | timestamp | YES | — | NULL / none | — |
| status | enum('active','completed','expired') | NO | — | active | — |
| created_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

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

</details>

## customer_wallet

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| wallet_id | int | NO | PRI | NULL / none | auto_increment |
| user_id | int | NO | UNI | NULL / none | — |
| balance | int | NO | — | 0 | — |
| created_at | timestamp | YES | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| updated_at | timestamp | YES | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

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

</details>

## flea_market_checkout_idempotency

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| idempotency_key | varchar(80) | NO | PRI | NULL / none | — |
| session_id | varchar(64) | NO | MUL | NULL / none | — |
| invoice_ids | longtext | YES | — | NULL / none | — |
| status | enum('processing','completed','failed') | NO | — | processing | — |
| created_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

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

</details>

## invoices

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| invoice_id | int | NO | PRI | NULL / none | auto_increment |
| invoice_number | varchar(100) | NO | UNI | NULL / none | — |
| order_id | int | NO | MUL | NULL / none | — |
| vendor_id | int | NO | MUL | NULL / none | — |
| user_id | int | NO | — | NULL / none | — |
| subtotal | decimal(10,2) | NO | — | 0.00 | — |
| tax_total | decimal(10,2) | YES | — | 0.00 | — |
| shipping_amount | decimal(10,2) | YES | — | 0.00 | — |
| reward_discount | decimal(10,2) | YES | — | 0.00 | — |
| grand_total | decimal(10,2) | NO | — | NULL / none | — |
| invoice_status | enum('generated','cancelled') | YES | — | generated | — |
| invoice_date | datetime | YES | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| created_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| source | enum('ecommerce','flea_market') | NO | — | ecommerce | — |
| location_id | int unsigned | YES | MUL | NULL / none | — |
| session_id | varchar(64) | YES | MUL | NULL / none | — |
| schedule_id | int unsigned | YES | MUL | NULL / none | — |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

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

</details>

## invoice_items

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| invoice_item_id | int | NO | PRI | NULL / none | auto_increment |
| invoice_id | int | NO | MUL | NULL / none | — |
| product_id | int | NO | — | NULL / none | — |
| variant_id | int | NO | — | NULL / none | — |
| product_name | varchar(255) | YES | — | NULL / none | — |
| sku | varchar(100) | YES | — | NULL / none | — |
| quantity | int | NO | — | NULL / none | — |
| unit_price | decimal(10,2) | NO | — | NULL / none | — |
| tax_rate | decimal(5,2) | YES | — | 0.00 | — |
| hsn_code | varchar(20) | YES | — | NULL / none | — |
| cgst_amount | decimal(10,2) | YES | — | 0.00 | — |
| sgst_amount | decimal(10,2) | YES | — | 0.00 | — |
| igst_amount | decimal(10,2) | YES | — | 0.00 | — |
| line_total | decimal(10,2) | NO | — | NULL / none | — |
| created_at | timestamp | NO | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

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

</details>

## wallet_transactions

| Column | Type | Nullable | Index | Default | Extra |
|---|---|---|---|---|---|
| transaction_id | int | NO | PRI | NULL / none | auto_increment |
| user_id | int | NO | MUL | NULL / none | — |
| title | varchar(150) | NO | — | NULL / none | — |
| description | varchar(255) | YES | — | NULL / none | — |
| transaction_type | enum('credit','debit') | NO | MUL | NULL / none | — |
| coins | int | NO | — | NULL / none | — |
| balance_after | int | YES | — | NULL / none | — |
| category | enum('steps','order','reward','referral','admin') | YES | — | reward | — |
| reference_id | int | YES | — | NULL / none | — |
| expiry_date | datetime | YES | MUL | NULL / none | — |
| created_at | timestamp | YES | — | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| reason_code | enum('ORDER_REWARD','REFERRAL_BONUS','ADMIN_ADJUSTMENT','REDEEM','EXPIRY','ORDER_REFUND','SHIPMENT_REWARD_REFUND','ORDER_REWARD_REVERSAL','SHIPMENT_REWARD_REVERSAL') | YES | — | ORDER_REWARD | — |

<details><summary>Exact CREATE TABLE definition (constraints, indexes, generated expressions)</summary>

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

</details>

