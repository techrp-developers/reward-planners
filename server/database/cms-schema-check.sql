-- Read-only. Lists every CMS table/column that is missing or
-- different from the expected schema. An empty result means the schema matches.
SELECT e.t AS table_name, e.c AS column_name, e.ty AS expected_type, c.column_type AS live_type,
  CASE WHEN c.column_name IS NULL THEN 'MISSING'
       WHEN c.column_type <> e.ty THEN 'DIFFERENT TYPE'
       ELSE 'DIFFERENT NULLABILITY' END AS problem
FROM (
  SELECT 'content_zone_entries' AS t, 'content_id' AS c, 'bigint unsigned' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'module' AS c, 'enum(''product'',''service'',''payment'',''dineout'',''mobile_dashboard'')' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'zone' AS c, 'enum(''navbar_background'',''promotional_banner'',''offers_banner'',''brand_promotional_banner'')' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'content_type' AS c, 'enum(''color'',''image'')' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'display_mode' AS c, 'enum(''single'',''carousel'',''grid_2'',''grid_3'')' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'color_value' AS c, 'text' AS ty, 'YES' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'text_color' AS c, 'varchar(9)' AS ty, 'YES' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'image_url' AS c, 'text' AS ty, 'YES' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'title' AS c, 'varchar(255)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'cta_text' AS c, 'varchar(255)' AS ty, 'YES' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'redirect_link' AS c, 'text' AS ty, 'YES' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'target_type' AS c, 'enum(''product'',''category'',''subcategory'',''service'',''service_category'',''service_bundle'')' AS ty, 'YES' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'target_id' AS c, 'bigint unsigned' AS ty, 'YES' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'target_ids' AS c, 'longtext' AS ty, 'YES' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'start_at' AS c, 'datetime' AS ty, 'YES' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'end_at' AS c, 'datetime' AS ty, 'YES' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'priority' AS c, 'int' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'is_default' AS c, 'tinyint(1)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'is_published' AS c, 'tinyint(1)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'created_by_name' AS c, 'varchar(255)' AS ty, 'YES' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'created_at' AS c, 'timestamp' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'updated_at' AS c, 'timestamp' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'motion_effect' AS c, 'enum(''none'',''falling_petals'',''twinkle'',''shine_sweep'',''glow_pulse'',''slow_zoom'')' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'motion_intensity' AS c, 'enum(''low'',''medium'',''high'')' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'motion_speed' AS c, 'enum(''slow'',''normal'',''fast'')' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'discount_type' AS c, 'enum(''none'',''percentage'',''fixed'')' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entries' AS t, 'discount_value' AS c, 'decimal(12,2)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entry_images' AS t, 'image_id' AS c, 'bigint unsigned' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entry_images' AS t, 'content_id' AS c, 'bigint unsigned' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entry_images' AS t, 'image_url' AS c, 'text' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entry_images' AS t, 'sort_order' AS c, 'int' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entry_images' AS t, 'is_active' AS c, 'tinyint(1)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_zone_entry_images' AS t, 'target_type' AS c, 'enum(''product'',''category'',''subcategory'',''service'',''service_category'',''service_bundle'')' AS ty, 'YES' AS nl UNION ALL
  SELECT 'content_zone_entry_images' AS t, 'target_id' AS c, 'bigint unsigned' AS ty, 'YES' AS nl UNION ALL
  SELECT 'content_zone_entry_images' AS t, 'target_ids' AS c, 'longtext' AS ty, 'YES' AS nl UNION ALL
  SELECT 'content_product_offers' AS t, 'content_id' AS c, 'bigint unsigned' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_product_offers' AS t, 'product_id' AS c, 'int' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_product_offers' AS t, 'variant_id' AS c, 'int' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_product_offers' AS t, 'offer_price' AS c, 'decimal(12,2)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_product_offers' AS t, 'created_at' AS c, 'timestamp' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_product_offers' AS t, 'updated_at' AS c, 'timestamp' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_service_offers' AS t, 'content_id' AS c, 'bigint unsigned' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_service_offers' AS t, 'service_id' AS c, 'int' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_service_offers' AS t, 'variant_id' AS c, 'int' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_service_offers' AS t, 'offer_price' AS c, 'decimal(12,2)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_service_offers' AS t, 'created_at' AS c, 'timestamp' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_service_offers' AS t, 'updated_at' AS c, 'timestamp' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_bundle_offers' AS t, 'content_id' AS c, 'bigint unsigned' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_bundle_offers' AS t, 'bundle_id' AS c, 'int' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_bundle_offers' AS t, 'offer_price' AS c, 'decimal(12,2)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_bundle_offers' AS t, 'created_at' AS c, 'timestamp' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_bundle_offers' AS t, 'updated_at' AS c, 'timestamp' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_splashscreen_placements' AS t, 'id' AS c, 'bigint unsigned' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_splashscreen_placements' AS t, 'content_id' AS c, 'bigint unsigned' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_splashscreen_placements' AS t, 'page_key' AS c, 'varchar(64)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_splashscreen_placements' AS t, 'slot_key' AS c, 'varchar(64)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_splashscreen_placements' AS t, 'platform' AS c, 'enum(''all'',''android'',''ios'')' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_splashscreen_placements' AS t, 'audience' AS c, 'enum(''all'',''authenticated'',''guest'')' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_splashscreen_placements' AS t, 'frequency_rule' AS c, 'enum(''once_per_session'',''once_per_day'',''every_visit'')' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_splashscreen_placements' AS t, 'display_seconds' AS c, 'smallint unsigned' AS ty, 'YES' AS nl UNION ALL
  SELECT 'cms_splashscreen_placements' AS t, 'is_enabled' AS c, 'tinyint(1)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_splashscreen_placements' AS t, 'created_at' AS c, 'timestamp' AS ty, 'YES' AS nl UNION ALL
  SELECT 'cms_splashscreen_defaults' AS t, 'id' AS c, 'bigint unsigned' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_splashscreen_defaults' AS t, 'page_key' AS c, 'varchar(64)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_splashscreen_defaults' AS t, 'slot_key' AS c, 'varchar(64)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_splashscreen_defaults' AS t, 'platform' AS c, 'enum(''all'',''android'',''ios'')' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_splashscreen_defaults' AS t, 'fallback_policy' AS c, 'enum(''show_content'',''skip'')' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_splashscreen_defaults' AS t, 'default_content_id' AS c, 'bigint unsigned' AS ty, 'YES' AS nl UNION ALL
  SELECT 'cms_dashboard_layouts' AS t, 'layout_key' AS c, 'varchar(32)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_dashboard_layouts' AS t, 'version' AS c, 'int unsigned' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_dashboard_layouts' AS t, 'status' AS c, 'enum(''draft'',''published'')' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_dashboard_layouts' AS t, 'config_json' AS c, 'longtext' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_dashboard_layouts' AS t, 'updated_by' AS c, 'bigint unsigned' AS ty, 'YES' AS nl UNION ALL
  SELECT 'cms_dashboard_layouts' AS t, 'created_at' AS c, 'timestamp' AS ty, 'NO' AS nl UNION ALL
  SELECT 'cms_dashboard_layouts' AS t, 'updated_at' AS c, 'timestamp' AS ty, 'NO' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'icon_id' AS c, 'bigint unsigned' AS ty, 'NO' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'module_key' AS c, 'varchar(50)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'placement' AS c, 'enum(''both'',''dashboard'',''navbar'')' AS ty, 'NO' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'icon_type' AS c, 'varchar(50)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'icon_url' AS c, 'text' AS ty, 'YES' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'active_icon_url' AS c, 'text' AS ty, 'YES' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'dashboard_icon_url' AS c, 'text' AS ty, 'YES' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'normal_color' AS c, 'varchar(9)' AS ty, 'YES' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'active_color' AS c, 'varchar(9)' AS ty, 'YES' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'gradient_start_color' AS c, 'varchar(9)' AS ty, 'YES' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'gradient_end_color' AS c, 'varchar(9)' AS ty, 'YES' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'route_key' AS c, 'varchar(255)' AS ty, 'YES' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'label' AS c, 'varchar(255)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'sort_order' AS c, 'int' AS ty, 'NO' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'is_active' AS c, 'tinyint(1)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'created_by_name' AS c, 'varchar(255)' AS ty, 'YES' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'created_at' AS c, 'timestamp' AS ty, 'NO' AS nl UNION ALL
  SELECT 'module_icons' AS t, 'updated_at' AS c, 'timestamp' AS ty, 'NO' AS nl UNION ALL
  SELECT 'app_icon_campaigns' AS t, 'id' AS c, 'int unsigned' AS ty, 'NO' AS nl UNION ALL
  SELECT 'app_icon_campaigns' AS t, 'platform' AS c, 'enum(''ios'',''android'')' AS ty, 'NO' AS nl UNION ALL
  SELECT 'app_icon_campaigns' AS t, 'icon_key' AS c, 'enum(''default'',''diwali'',''eid'',''christmas'',''holi'',''independence_day'',''navratri'',''dasera'')' AS ty, 'NO' AS nl UNION ALL
  SELECT 'app_icon_campaigns' AS t, 'starts_at' AS c, 'datetime(3)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'app_icon_campaigns' AS t, 'ends_at' AS c, 'datetime(3)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'app_icon_campaigns' AS t, 'priority' AS c, 'int' AS ty, 'NO' AS nl UNION ALL
  SELECT 'app_icon_campaigns' AS t, 'is_active' AS c, 'tinyint(1)' AS ty, 'NO' AS nl UNION ALL
  SELECT 'app_icon_campaigns' AS t, 'created_at' AS c, 'timestamp' AS ty, 'NO' AS nl UNION ALL
  SELECT 'app_icon_campaigns' AS t, 'updated_at' AS c, 'timestamp' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_effective_product_offers' AS t, 'content_id' AS c, 'bigint unsigned' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_effective_product_offers' AS t, 'product_id' AS c, 'int' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_effective_product_offers' AS t, 'variant_id' AS c, 'int' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_effective_product_offers' AS t, 'offer_price' AS c, 'decimal(22,2)' AS ty, 'YES' AS nl UNION ALL
  SELECT 'content_effective_service_offers' AS t, 'content_id' AS c, 'bigint unsigned' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_effective_service_offers' AS t, 'service_id' AS c, 'int' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_effective_service_offers' AS t, 'variant_id' AS c, 'int' AS ty, 'NO' AS nl UNION ALL
  SELECT 'content_effective_service_offers' AS t, 'offer_price' AS c, 'decimal(22,2)' AS ty, 'YES' AS nl
) e
LEFT JOIN information_schema.columns c
  ON c.table_schema = DATABASE() AND c.table_name = e.t AND c.column_name = e.c
WHERE c.column_name IS NULL OR c.column_type <> e.ty OR c.is_nullable <> e.nl
ORDER BY e.t, e.c;
