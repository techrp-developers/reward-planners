-- Reward Planners CMS: database schema for deployment.
-- Generated from the working local database (MySQL 8.0.44) on 2026-11-03.
--
-- Safe to run on a live database, and safe to run again:
--   * a missing table is created exactly as it is locally;
--   * on an existing table, only missing columns and indexes are added;
--   * no existing column is changed and no row is inserted, changed or deleted.
-- Back up the live database first. Then run cms-schema-check.sql
-- to confirm nothing is still missing or different.
SET NAMES utf8mb4;

-- ===================================================================
-- content_zone_entries: Every CMS banner/entry: zone, image or colour, title, CTA, target (products, category, services), schedule, priority, discount, motion.
-- ===================================================================
CREATE TABLE IF NOT EXISTS `content_zone_entries` (
  `content_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `module` enum('product','service','payment','dineout','mobile_dashboard','bus_booking') COLLATE utf8mb4_unicode_ci NOT NULL,
  `zone` enum('navbar_background','promotional_banner','offers_banner','brand_promotional_banner') COLLATE utf8mb4_unicode_ci NOT NULL,
  `content_type` enum('color','image') COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_mode` enum('single','carousel','grid_2','grid_3') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'carousel',
  `color_value` text COLLATE utf8mb4_unicode_ci,
  `text_color` varchar(9) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_url` text COLLATE utf8mb4_unicode_ci,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cta_text` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `redirect_link` text COLLATE utf8mb4_unicode_ci,
  `target_type` enum('product','category','subcategory','service','service_category','service_bundle') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_id` bigint unsigned DEFAULT NULL,
  `target_ids` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `start_at` datetime DEFAULT NULL,
  `end_at` datetime DEFAULT NULL,
  `priority` int NOT NULL DEFAULT '0',
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `is_published` tinyint(1) NOT NULL DEFAULT '0',
  `created_by_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `motion_effect` enum('none','falling_petals','twinkle','shine_sweep','glow_pulse','slow_zoom') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `motion_intensity` enum('low','medium','high') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'medium',
  `motion_speed` enum('slow','normal','fast') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal',
  `discount_type` enum('none','percentage','fixed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `discount_value` decimal(12,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`content_id`),
  KEY `idx_content_module_zone` (`module`,`zone`),
  KEY `idx_content_published` (`is_published`),
  KEY `idx_content_default` (`is_default`),
  KEY `idx_content_schedule` (`start_at`,`end_at`),
  KEY `idx_content_priority` (`priority`),
  KEY `idx_content_entry_target` (`target_type`,`target_id`),
  CONSTRAINT `content_zone_entries_chk_1` CHECK (json_valid(`target_ids`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'content_id') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `content_id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'module') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `module` enum(''product'',''service'',''payment'',''dineout'',''mobile_dashboard'',''bus_booking'') COLLATE utf8mb4_unicode_ci NOT NULL AFTER `content_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'zone') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `zone` enum(''navbar_background'',''promotional_banner'',''offers_banner'',''brand_promotional_banner'') COLLATE utf8mb4_unicode_ci NOT NULL AFTER `module`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'content_type') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `content_type` enum(''color'',''image'') COLLATE utf8mb4_unicode_ci NOT NULL AFTER `zone`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'display_mode') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `display_mode` enum(''single'',''carousel'',''grid_2'',''grid_3'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''carousel'' AFTER `content_type`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'color_value') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `color_value` text COLLATE utf8mb4_unicode_ci AFTER `display_mode`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'text_color') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `text_color` varchar(9) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `color_value`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'image_url') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `image_url` text COLLATE utf8mb4_unicode_ci AFTER `text_color`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'title') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `image_url`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'cta_text') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `cta_text` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `title`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'redirect_link') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `redirect_link` text COLLATE utf8mb4_unicode_ci AFTER `cta_text`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'target_type') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `target_type` enum(''product'',''category'',''subcategory'',''service'',''service_category'',''service_bundle'') COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `redirect_link`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'target_id') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `target_id` bigint unsigned DEFAULT NULL AFTER `target_type`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'target_ids') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `target_ids` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin AFTER `target_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'start_at') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `start_at` datetime DEFAULT NULL AFTER `target_ids`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'end_at') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `end_at` datetime DEFAULT NULL AFTER `start_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'priority') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `priority` int NOT NULL DEFAULT ''0'' AFTER `end_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'is_default') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `is_default` tinyint(1) NOT NULL DEFAULT ''0'' AFTER `priority`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'is_published') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `is_published` tinyint(1) NOT NULL DEFAULT ''0'' AFTER `is_default`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'created_by_name') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `created_by_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `is_published`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'created_at') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `created_by_name`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'updated_at') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'motion_effect') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `motion_effect` enum(''none'',''falling_petals'',''twinkle'',''shine_sweep'',''glow_pulse'',''slow_zoom'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''none'' AFTER `updated_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'motion_intensity') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `motion_intensity` enum(''low'',''medium'',''high'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''medium'' AFTER `motion_effect`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'motion_speed') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `motion_speed` enum(''slow'',''normal'',''fast'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''normal'' AFTER `motion_intensity`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'discount_type') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `discount_type` enum(''none'',''percentage'',''fixed'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''none'' AFTER `motion_speed`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND column_name = 'discount_value') = 0,
  'ALTER TABLE `content_zone_entries` ADD COLUMN `discount_value` decimal(12,2) NOT NULL DEFAULT ''0.00'' AFTER `discount_type`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND index_name = 'idx_content_module_zone') = 0,
  'ALTER TABLE `content_zone_entries` ADD KEY `idx_content_module_zone` (`module`,`zone`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND index_name = 'idx_content_published') = 0,
  'ALTER TABLE `content_zone_entries` ADD KEY `idx_content_published` (`is_published`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND index_name = 'idx_content_default') = 0,
  'ALTER TABLE `content_zone_entries` ADD KEY `idx_content_default` (`is_default`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND index_name = 'idx_content_schedule') = 0,
  'ALTER TABLE `content_zone_entries` ADD KEY `idx_content_schedule` (`start_at`,`end_at`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND index_name = 'idx_content_priority') = 0,
  'ALTER TABLE `content_zone_entries` ADD KEY `idx_content_priority` (`priority`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'content_zone_entries' AND index_name = 'idx_content_entry_target') = 0,
  'ALTER TABLE `content_zone_entries` ADD KEY `idx_content_entry_target` (`target_type`,`target_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===================================================================
-- content_zone_entry_images: Slider images of an entry, each with its own optional target.
-- ===================================================================
CREATE TABLE IF NOT EXISTS `content_zone_entry_images` (
  `image_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `content_id` bigint unsigned NOT NULL,
  `image_url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `target_type` enum('product','category','subcategory','service','service_category','service_bundle') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `target_id` bigint unsigned DEFAULT NULL,
  `target_ids` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  PRIMARY KEY (`image_id`),
  KEY `idx_entry_images_content_id` (`content_id`),
  KEY `idx_entry_images_sort` (`content_id`,`sort_order`),
  KEY `idx_entry_images_active` (`content_id`,`is_active`),
  KEY `idx_content_offer_target` (`target_type`,`target_id`),
  CONSTRAINT `fk_entry_images_content` FOREIGN KEY (`content_id`) REFERENCES `content_zone_entries` (`content_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `content_zone_entry_images_chk_1` CHECK (json_valid(`target_ids`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entry_images' AND column_name = 'image_id') = 0,
  'ALTER TABLE `content_zone_entry_images` ADD COLUMN `image_id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entry_images' AND column_name = 'content_id') = 0,
  'ALTER TABLE `content_zone_entry_images` ADD COLUMN `content_id` bigint unsigned NOT NULL AFTER `image_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entry_images' AND column_name = 'image_url') = 0,
  'ALTER TABLE `content_zone_entry_images` ADD COLUMN `image_url` text COLLATE utf8mb4_unicode_ci NOT NULL AFTER `content_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entry_images' AND column_name = 'sort_order') = 0,
  'ALTER TABLE `content_zone_entry_images` ADD COLUMN `sort_order` int NOT NULL DEFAULT ''0'' AFTER `image_url`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entry_images' AND column_name = 'is_active') = 0,
  'ALTER TABLE `content_zone_entry_images` ADD COLUMN `is_active` tinyint(1) NOT NULL DEFAULT ''1'' AFTER `sort_order`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entry_images' AND column_name = 'target_type') = 0,
  'ALTER TABLE `content_zone_entry_images` ADD COLUMN `target_type` enum(''product'',''category'',''subcategory'',''service'',''service_category'',''service_bundle'') COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `is_active`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entry_images' AND column_name = 'target_id') = 0,
  'ALTER TABLE `content_zone_entry_images` ADD COLUMN `target_id` bigint unsigned DEFAULT NULL AFTER `target_type`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_zone_entry_images' AND column_name = 'target_ids') = 0,
  'ALTER TABLE `content_zone_entry_images` ADD COLUMN `target_ids` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin AFTER `target_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'content_zone_entry_images' AND index_name = 'idx_entry_images_content_id') = 0,
  'ALTER TABLE `content_zone_entry_images` ADD KEY `idx_entry_images_content_id` (`content_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'content_zone_entry_images' AND index_name = 'idx_entry_images_sort') = 0,
  'ALTER TABLE `content_zone_entry_images` ADD KEY `idx_entry_images_sort` (`content_id`,`sort_order`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'content_zone_entry_images' AND index_name = 'idx_entry_images_active') = 0,
  'ALTER TABLE `content_zone_entry_images` ADD KEY `idx_entry_images_active` (`content_id`,`is_active`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'content_zone_entry_images' AND index_name = 'idx_content_offer_target') = 0,
  'ALTER TABLE `content_zone_entry_images` ADD KEY `idx_content_offer_target` (`target_type`,`target_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===================================================================
-- content_product_offers: Fixed offer prices for product variants inside a promotion.
-- ===================================================================
CREATE TABLE IF NOT EXISTS `content_product_offers` (
  `content_id` bigint unsigned NOT NULL,
  `product_id` int NOT NULL,
  `variant_id` int NOT NULL,
  `offer_price` decimal(12,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`content_id`,`variant_id`),
  KEY `idx_content_offer_product` (`product_id`,`variant_id`),
  KEY `fk_content_offer_variant` (`variant_id`),
  CONSTRAINT `fk_content_offer_entry` FOREIGN KEY (`content_id`) REFERENCES `content_zone_entries` (`content_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_content_offer_product` FOREIGN KEY (`product_id`) REFERENCES `eproducts` (`product_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_content_offer_variant` FOREIGN KEY (`variant_id`) REFERENCES `product_variants` (`variant_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_product_offers' AND column_name = 'content_id') = 0,
  'ALTER TABLE `content_product_offers` ADD COLUMN `content_id` bigint unsigned NOT NULL FIRST', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_product_offers' AND column_name = 'product_id') = 0,
  'ALTER TABLE `content_product_offers` ADD COLUMN `product_id` int NOT NULL AFTER `content_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_product_offers' AND column_name = 'variant_id') = 0,
  'ALTER TABLE `content_product_offers` ADD COLUMN `variant_id` int NOT NULL AFTER `product_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_product_offers' AND column_name = 'offer_price') = 0,
  'ALTER TABLE `content_product_offers` ADD COLUMN `offer_price` decimal(12,2) NOT NULL AFTER `variant_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_product_offers' AND column_name = 'created_at') = 0,
  'ALTER TABLE `content_product_offers` ADD COLUMN `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `offer_price`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_product_offers' AND column_name = 'updated_at') = 0,
  'ALTER TABLE `content_product_offers` ADD COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'content_product_offers' AND index_name = 'idx_content_offer_product') = 0,
  'ALTER TABLE `content_product_offers` ADD KEY `idx_content_offer_product` (`product_id`,`variant_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'content_product_offers' AND index_name = 'fk_content_offer_variant') = 0,
  'ALTER TABLE `content_product_offers` ADD KEY `fk_content_offer_variant` (`variant_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===================================================================
-- content_service_offers: Fixed offer prices for service variants inside a promotion.
-- ===================================================================
CREATE TABLE IF NOT EXISTS `content_service_offers` (
  `content_id` bigint unsigned NOT NULL,
  `service_id` int NOT NULL,
  `variant_id` int NOT NULL,
  `offer_price` decimal(12,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`content_id`,`variant_id`),
  KEY `idx_content_service_offer_service` (`service_id`,`variant_id`),
  KEY `fk_content_service_offer_variant` (`variant_id`),
  CONSTRAINT `fk_content_service_offer_entry` FOREIGN KEY (`content_id`) REFERENCES `content_zone_entries` (`content_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_content_service_offer_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_content_service_offer_variant` FOREIGN KEY (`variant_id`) REFERENCES `service_variants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_service_offers' AND column_name = 'content_id') = 0,
  'ALTER TABLE `content_service_offers` ADD COLUMN `content_id` bigint unsigned NOT NULL FIRST', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_service_offers' AND column_name = 'service_id') = 0,
  'ALTER TABLE `content_service_offers` ADD COLUMN `service_id` int NOT NULL AFTER `content_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_service_offers' AND column_name = 'variant_id') = 0,
  'ALTER TABLE `content_service_offers` ADD COLUMN `variant_id` int NOT NULL AFTER `service_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_service_offers' AND column_name = 'offer_price') = 0,
  'ALTER TABLE `content_service_offers` ADD COLUMN `offer_price` decimal(12,2) NOT NULL AFTER `variant_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_service_offers' AND column_name = 'created_at') = 0,
  'ALTER TABLE `content_service_offers` ADD COLUMN `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `offer_price`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_service_offers' AND column_name = 'updated_at') = 0,
  'ALTER TABLE `content_service_offers` ADD COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'content_service_offers' AND index_name = 'idx_content_service_offer_service') = 0,
  'ALTER TABLE `content_service_offers` ADD KEY `idx_content_service_offer_service` (`service_id`,`variant_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'content_service_offers' AND index_name = 'fk_content_service_offer_variant') = 0,
  'ALTER TABLE `content_service_offers` ADD KEY `fk_content_service_offer_variant` (`variant_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===================================================================
-- content_bundle_offers: Fixed offer prices for service bundles inside a promotion.
-- ===================================================================
CREATE TABLE IF NOT EXISTS `content_bundle_offers` (
  `content_id` bigint unsigned NOT NULL,
  `bundle_id` int NOT NULL,
  `offer_price` decimal(12,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`content_id`,`bundle_id`),
  KEY `fk_content_bundle_offer_bundle` (`bundle_id`),
  CONSTRAINT `fk_content_bundle_offer_bundle` FOREIGN KEY (`bundle_id`) REFERENCES `service_bundles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_content_bundle_offer_entry` FOREIGN KEY (`content_id`) REFERENCES `content_zone_entries` (`content_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_bundle_offers' AND column_name = 'content_id') = 0,
  'ALTER TABLE `content_bundle_offers` ADD COLUMN `content_id` bigint unsigned NOT NULL FIRST', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_bundle_offers' AND column_name = 'bundle_id') = 0,
  'ALTER TABLE `content_bundle_offers` ADD COLUMN `bundle_id` int NOT NULL AFTER `content_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_bundle_offers' AND column_name = 'offer_price') = 0,
  'ALTER TABLE `content_bundle_offers` ADD COLUMN `offer_price` decimal(12,2) NOT NULL AFTER `bundle_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_bundle_offers' AND column_name = 'created_at') = 0,
  'ALTER TABLE `content_bundle_offers` ADD COLUMN `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `offer_price`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'content_bundle_offers' AND column_name = 'updated_at') = 0,
  'ALTER TABLE `content_bundle_offers` ADD COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'content_bundle_offers' AND index_name = 'fk_content_bundle_offer_bundle') = 0,
  'ALTER TABLE `content_bundle_offers` ADD KEY `fk_content_bundle_offer_bundle` (`bundle_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===================================================================
-- cms_splashscreen_placements: Where a CMS entry is shown as a splash, popup or banner: page, slot, platform, audience, frequency, duration.
-- ===================================================================
CREATE TABLE IF NOT EXISTS `cms_splashscreen_placements` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `content_id` bigint unsigned NOT NULL,
  `page_key` varchar(64) NOT NULL,
  `slot_key` varchar(64) NOT NULL,
  `platform` enum('all','android','ios') NOT NULL DEFAULT 'all',
  `audience` enum('all','authenticated','guest') NOT NULL DEFAULT 'all',
  `frequency_rule` enum('once_per_session','once_per_day','every_visit') NOT NULL DEFAULT 'once_per_day',
  `display_seconds` smallint unsigned DEFAULT NULL,
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_campaign_placement` (`content_id`,`page_key`,`slot_key`,`platform`,`audience`),
  KEY `idx_screen_lookup` (`page_key`,`slot_key`,`is_enabled`),
  CONSTRAINT `fk_screen_placement_content` FOREIGN KEY (`content_id`) REFERENCES `content_zone_entries` (`content_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_placements' AND column_name = 'id') = 0,
  'ALTER TABLE `cms_splashscreen_placements` ADD COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_placements' AND column_name = 'content_id') = 0,
  'ALTER TABLE `cms_splashscreen_placements` ADD COLUMN `content_id` bigint unsigned NOT NULL AFTER `id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_placements' AND column_name = 'page_key') = 0,
  'ALTER TABLE `cms_splashscreen_placements` ADD COLUMN `page_key` varchar(64) NOT NULL AFTER `content_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_placements' AND column_name = 'slot_key') = 0,
  'ALTER TABLE `cms_splashscreen_placements` ADD COLUMN `slot_key` varchar(64) NOT NULL AFTER `page_key`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_placements' AND column_name = 'platform') = 0,
  'ALTER TABLE `cms_splashscreen_placements` ADD COLUMN `platform` enum(''all'',''android'',''ios'') NOT NULL DEFAULT ''all'' AFTER `slot_key`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_placements' AND column_name = 'audience') = 0,
  'ALTER TABLE `cms_splashscreen_placements` ADD COLUMN `audience` enum(''all'',''authenticated'',''guest'') NOT NULL DEFAULT ''all'' AFTER `platform`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_placements' AND column_name = 'frequency_rule') = 0,
  'ALTER TABLE `cms_splashscreen_placements` ADD COLUMN `frequency_rule` enum(''once_per_session'',''once_per_day'',''every_visit'') NOT NULL DEFAULT ''once_per_day'' AFTER `audience`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_placements' AND column_name = 'display_seconds') = 0,
  'ALTER TABLE `cms_splashscreen_placements` ADD COLUMN `display_seconds` smallint unsigned DEFAULT NULL AFTER `frequency_rule`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_placements' AND column_name = 'is_enabled') = 0,
  'ALTER TABLE `cms_splashscreen_placements` ADD COLUMN `is_enabled` tinyint(1) NOT NULL DEFAULT ''1'' AFTER `display_seconds`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_placements' AND column_name = 'created_at') = 0,
  'ALTER TABLE `cms_splashscreen_placements` ADD COLUMN `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP AFTER `is_enabled`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_placements' AND index_name = 'uq_campaign_placement') = 0,
  'ALTER TABLE `cms_splashscreen_placements` ADD UNIQUE KEY `uq_campaign_placement` (`content_id`,`page_key`,`slot_key`,`platform`,`audience`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_placements' AND index_name = 'idx_screen_lookup') = 0,
  'ALTER TABLE `cms_splashscreen_placements` ADD KEY `idx_screen_lookup` (`page_key`,`slot_key`,`is_enabled`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===================================================================
-- cms_splashscreen_defaults: What a page/slot shows when no scheduled campaign is live: evergreen content, or nothing.
-- ===================================================================
CREATE TABLE IF NOT EXISTS `cms_splashscreen_defaults` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `page_key` varchar(64) NOT NULL,
  `slot_key` varchar(64) NOT NULL,
  `platform` enum('all','android','ios') NOT NULL DEFAULT 'all',
  `fallback_policy` enum('show_content','skip') NOT NULL DEFAULT 'skip',
  `default_content_id` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_screen_default` (`page_key`,`slot_key`,`platform`),
  KEY `fk_screen_default_content` (`default_content_id`),
  CONSTRAINT `fk_screen_default_content` FOREIGN KEY (`default_content_id`) REFERENCES `content_zone_entries` (`content_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_defaults' AND column_name = 'id') = 0,
  'ALTER TABLE `cms_splashscreen_defaults` ADD COLUMN `id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_defaults' AND column_name = 'page_key') = 0,
  'ALTER TABLE `cms_splashscreen_defaults` ADD COLUMN `page_key` varchar(64) NOT NULL AFTER `id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_defaults' AND column_name = 'slot_key') = 0,
  'ALTER TABLE `cms_splashscreen_defaults` ADD COLUMN `slot_key` varchar(64) NOT NULL AFTER `page_key`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_defaults' AND column_name = 'platform') = 0,
  'ALTER TABLE `cms_splashscreen_defaults` ADD COLUMN `platform` enum(''all'',''android'',''ios'') NOT NULL DEFAULT ''all'' AFTER `slot_key`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_defaults' AND column_name = 'fallback_policy') = 0,
  'ALTER TABLE `cms_splashscreen_defaults` ADD COLUMN `fallback_policy` enum(''show_content'',''skip'') NOT NULL DEFAULT ''skip'' AFTER `platform`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_defaults' AND column_name = 'default_content_id') = 0,
  'ALTER TABLE `cms_splashscreen_defaults` ADD COLUMN `default_content_id` bigint unsigned DEFAULT NULL AFTER `fallback_policy`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_defaults' AND index_name = 'uq_screen_default') = 0,
  'ALTER TABLE `cms_splashscreen_defaults` ADD UNIQUE KEY `uq_screen_default` (`page_key`,`slot_key`,`platform`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cms_splashscreen_defaults' AND index_name = 'fk_screen_default_content') = 0,
  'ALTER TABLE `cms_splashscreen_defaults` ADD KEY `fk_screen_default_content` (`default_content_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===================================================================
-- cms_dashboard_layouts: Mobile dashboard section layout (order and visibility).
-- ===================================================================
CREATE TABLE IF NOT EXISTS `cms_dashboard_layouts` (
  `layout_key` varchar(32) NOT NULL,
  `version` int unsigned NOT NULL DEFAULT '1',
  `status` enum('draft','published') NOT NULL DEFAULT 'published',
  `config_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `updated_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`layout_key`),
  KEY `idx_cms_dashboard_status` (`status`),
  CONSTRAINT `cms_dashboard_layouts_chk_1` CHECK (json_valid(`config_json`))
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_dashboard_layouts' AND column_name = 'layout_key') = 0,
  'ALTER TABLE `cms_dashboard_layouts` ADD COLUMN `layout_key` varchar(32) NOT NULL FIRST', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_dashboard_layouts' AND column_name = 'version') = 0,
  'ALTER TABLE `cms_dashboard_layouts` ADD COLUMN `version` int unsigned NOT NULL DEFAULT ''1'' AFTER `layout_key`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_dashboard_layouts' AND column_name = 'status') = 0,
  'ALTER TABLE `cms_dashboard_layouts` ADD COLUMN `status` enum(''draft'',''published'') NOT NULL DEFAULT ''published'' AFTER `version`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_dashboard_layouts' AND column_name = 'config_json') = 0,
  'ALTER TABLE `cms_dashboard_layouts` ADD COLUMN `config_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL AFTER `status`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_dashboard_layouts' AND column_name = 'updated_by') = 0,
  'ALTER TABLE `cms_dashboard_layouts` ADD COLUMN `updated_by` bigint unsigned DEFAULT NULL AFTER `config_json`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_dashboard_layouts' AND column_name = 'created_at') = 0,
  'ALTER TABLE `cms_dashboard_layouts` ADD COLUMN `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `updated_by`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cms_dashboard_layouts' AND column_name = 'updated_at') = 0,
  'ALTER TABLE `cms_dashboard_layouts` ADD COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'cms_dashboard_layouts' AND index_name = 'idx_cms_dashboard_status') = 0,
  'ALTER TABLE `cms_dashboard_layouts` ADD KEY `idx_cms_dashboard_status` (`status`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===================================================================
-- module_icons: Dashboard module icons and labels.
-- ===================================================================
CREATE TABLE IF NOT EXISTS `module_icons` (
  `icon_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `module_key` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `placement` enum('both','dashboard','navbar') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'both',
  `icon_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'image',
  `icon_url` text COLLATE utf8mb4_unicode_ci,
  `active_icon_url` text COLLATE utf8mb4_unicode_ci,
  `dashboard_icon_url` text COLLATE utf8mb4_unicode_ci,
  `normal_color` varchar(9) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active_color` varchar(9) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gradient_start_color` varchar(9) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gradient_end_color` varchar(9) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `route_key` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`icon_id`),
  UNIQUE KEY `uk_module_icons_module_key` (`module_key`),
  KEY `idx_module_icons_placement` (`placement`),
  KEY `idx_module_icons_active` (`is_active`),
  KEY `idx_module_icons_sort` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'icon_id') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `icon_id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'module_key') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `module_key` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `icon_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'placement') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `placement` enum(''both'',''dashboard'',''navbar'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''both'' AFTER `module_key`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'icon_type') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `icon_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''image'' AFTER `placement`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'icon_url') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `icon_url` text COLLATE utf8mb4_unicode_ci AFTER `icon_type`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'active_icon_url') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `active_icon_url` text COLLATE utf8mb4_unicode_ci AFTER `icon_url`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'dashboard_icon_url') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `dashboard_icon_url` text COLLATE utf8mb4_unicode_ci AFTER `active_icon_url`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'normal_color') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `normal_color` varchar(9) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `dashboard_icon_url`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'active_color') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `active_color` varchar(9) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `normal_color`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'gradient_start_color') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `gradient_start_color` varchar(9) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `active_color`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'gradient_end_color') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `gradient_end_color` varchar(9) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `gradient_start_color`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'route_key') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `route_key` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `gradient_end_color`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'label') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `route_key`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'sort_order') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `sort_order` int NOT NULL DEFAULT ''0'' AFTER `label`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'is_active') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `is_active` tinyint(1) NOT NULL DEFAULT ''1'' AFTER `sort_order`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'created_by_name') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `created_by_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `is_active`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'created_at') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `created_by_name`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND column_name = 'updated_at') = 0,
  'ALTER TABLE `module_icons` ADD COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND index_name = 'uk_module_icons_module_key') = 0,
  'ALTER TABLE `module_icons` ADD UNIQUE KEY `uk_module_icons_module_key` (`module_key`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND index_name = 'idx_module_icons_placement') = 0,
  'ALTER TABLE `module_icons` ADD KEY `idx_module_icons_placement` (`placement`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND index_name = 'idx_module_icons_active') = 0,
  'ALTER TABLE `module_icons` ADD KEY `idx_module_icons_active` (`is_active`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'module_icons' AND index_name = 'idx_module_icons_sort') = 0,
  'ALTER TABLE `module_icons` ADD KEY `idx_module_icons_sort` (`sort_order`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===================================================================
-- app_icon_campaigns: Seasonal app icon campaigns.
-- ===================================================================
CREATE TABLE IF NOT EXISTS `app_icon_campaigns` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `platform` enum('ios','android') NOT NULL,
  `icon_key` enum('default','diwali','eid','christmas','holi','independence_day','navratri','dasera') NOT NULL,
  `starts_at` datetime(3) NOT NULL,
  `ends_at` datetime(3) NOT NULL,
  `priority` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_app_icon_resolution` (`platform`,`is_active`,`starts_at`,`ends_at`,`priority`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1;

SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'app_icon_campaigns' AND column_name = 'id') = 0,
  'ALTER TABLE `app_icon_campaigns` ADD COLUMN `id` int unsigned NOT NULL AUTO_INCREMENT FIRST', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'app_icon_campaigns' AND column_name = 'platform') = 0,
  'ALTER TABLE `app_icon_campaigns` ADD COLUMN `platform` enum(''ios'',''android'') NOT NULL AFTER `id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'app_icon_campaigns' AND column_name = 'icon_key') = 0,
  'ALTER TABLE `app_icon_campaigns` ADD COLUMN `icon_key` enum(''default'',''diwali'',''eid'',''christmas'',''holi'',''independence_day'',''navratri'',''dasera'') NOT NULL AFTER `platform`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'app_icon_campaigns' AND column_name = 'starts_at') = 0,
  'ALTER TABLE `app_icon_campaigns` ADD COLUMN `starts_at` datetime(3) NOT NULL AFTER `icon_key`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'app_icon_campaigns' AND column_name = 'ends_at') = 0,
  'ALTER TABLE `app_icon_campaigns` ADD COLUMN `ends_at` datetime(3) NOT NULL AFTER `starts_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'app_icon_campaigns' AND column_name = 'priority') = 0,
  'ALTER TABLE `app_icon_campaigns` ADD COLUMN `priority` int NOT NULL DEFAULT ''0'' AFTER `ends_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'app_icon_campaigns' AND column_name = 'is_active') = 0,
  'ALTER TABLE `app_icon_campaigns` ADD COLUMN `is_active` tinyint(1) NOT NULL DEFAULT ''1'' AFTER `priority`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'app_icon_campaigns' AND column_name = 'created_at') = 0,
  'ALTER TABLE `app_icon_campaigns` ADD COLUMN `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `is_active`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'app_icon_campaigns' AND column_name = 'updated_at') = 0,
  'ALTER TABLE `app_icon_campaigns` ADD COLUMN `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF((SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'app_icon_campaigns' AND index_name = 'idx_app_icon_resolution') = 0,
  'ALTER TABLE `app_icon_campaigns` ADD KEY `idx_app_icon_resolution` (`platform`,`is_active`,`starts_at`,`ends_at`,`priority`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ===================================================================
-- content_effective_product_offers (view): Live offer price per product variant from active promotions (fixed price, or percentage/fixed discount).
-- Recreated on every run: a view holds no data. No DEFINER, so it does not
-- depend on a root@localhost account existing on the server.
-- ===================================================================
CREATE OR REPLACE SQL SECURITY INVOKER VIEW `content_effective_product_offers` AS select `e`.`content_id` AS `content_id`,`p`.`product_id` AS `product_id`,`v`.`variant_id` AS `variant_id`,coalesce(`o`.`offer_price`,(case `e`.`discount_type` when 'percentage' then greatest(0.01,round((`v`.`sale_price` * (1 - (`e`.`discount_value` / 100))),2)) when 'fixed' then greatest(0.01,round((`v`.`sale_price` - `e`.`discount_value`),2)) else NULL end)) AS `offer_price` from (((`content_zone_entries` `e` join `eproducts` `p` on(((`p`.`is_deleted` = 0) and (((`e`.`target_type` = 'category') and (`p`.`category_id` = `e`.`target_id`)) or ((`e`.`target_type` = 'subcategory') and (`p`.`subcategory_id` = `e`.`target_id`)) or ((`e`.`target_type` = 'product') and (json_contains(coalesce(`e`.`target_ids`,'[]'),cast(`p`.`product_id` as char charset utf8mb4)) or ((json_length(coalesce(`e`.`target_ids`,'[]')) = 0) and (`p`.`product_id` = `e`.`target_id`)))) or exists(select 1 from `content_zone_entry_images` `i` where ((`i`.`content_id` = `e`.`content_id`) and (`i`.`is_active` = 1) and (((`i`.`target_type` = 'category') and (`p`.`category_id` = `i`.`target_id`)) or ((`i`.`target_type` = 'subcategory') and (`p`.`subcategory_id` = `i`.`target_id`)) or ((`i`.`target_type` = 'product') and (json_contains(coalesce(`i`.`target_ids`,'[]'),cast(`p`.`product_id` as char charset utf8mb4)) or ((json_length(coalesce(`i`.`target_ids`,'[]')) = 0) and (`p`.`product_id` = `i`.`target_id`))))))))))) join `product_variants` `v` on((`v`.`product_id` = `p`.`product_id`))) left join `content_product_offers` `o` on(((`o`.`content_id` = `e`.`content_id`) and (`o`.`variant_id` = `v`.`variant_id`) and (`o`.`product_id` = `p`.`product_id`)))) where ((`e`.`module` = 'product') and (`e`.`zone` in ('promotional_banner','offers_banner','brand_promotional_banner')) and ((`o`.`offer_price` is not null) or ((`e`.`discount_type` in ('percentage','fixed')) and (`e`.`discount_value` > 0) and (`v`.`sale_price` > 0))));

-- ===================================================================
-- content_effective_service_offers (view): Live offer price per service variant from active promotions.
-- Recreated on every run: a view holds no data. No DEFINER, so it does not
-- depend on a root@localhost account existing on the server.
-- ===================================================================
CREATE OR REPLACE SQL SECURITY INVOKER VIEW `content_effective_service_offers` AS select `e`.`content_id` AS `content_id`,`s`.`id` AS `service_id`,`v`.`id` AS `variant_id`,coalesce(`o`.`offer_price`,(case `e`.`discount_type` when 'percentage' then greatest(0.01,round((`v`.`price` * (1 - (`e`.`discount_value` / 100))),2)) when 'fixed' then greatest(0.01,round((`v`.`price` - `e`.`discount_value`),2)) else NULL end)) AS `offer_price` from (((`content_zone_entries` `e` join `services` `s` on((((`e`.`target_type` = 'service_category') and (`s`.`category_id` = `e`.`target_id`)) or ((`e`.`target_type` = 'service') and (json_contains(coalesce(`e`.`target_ids`,'[]'),cast(`s`.`id` as char charset utf8mb4)) or ((json_length(coalesce(`e`.`target_ids`,'[]')) = 0) and (`s`.`id` = `e`.`target_id`)))) or exists(select 1 from `content_zone_entry_images` `i` where ((`i`.`content_id` = `e`.`content_id`) and (`i`.`is_active` = 1) and (((`i`.`target_type` = 'service_category') and (`s`.`category_id` = `i`.`target_id`)) or ((`i`.`target_type` = 'service') and (json_contains(coalesce(`i`.`target_ids`,'[]'),cast(`s`.`id` as char charset utf8mb4)) or ((json_length(coalesce(`i`.`target_ids`,'[]')) = 0) and (`s`.`id` = `i`.`target_id`)))))))))) join `service_variants` `v` on(((`v`.`service_id` = `s`.`id`) and (`v`.`status` = 1)))) left join `content_service_offers` `o` on(((`o`.`content_id` = `e`.`content_id`) and (`o`.`variant_id` = `v`.`id`) and (`o`.`service_id` = `s`.`id`)))) where ((`e`.`module` = 'service') and (`e`.`zone` in ('promotional_banner','offers_banner','brand_promotional_banner')) and ((`o`.`offer_price` is not null) or ((`e`.`discount_type` in ('percentage','fixed')) and (`e`.`discount_value` > 0) and (`v`.`price` > 0))));
