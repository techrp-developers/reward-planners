CREATE TABLE IF NOT EXISTS svc_service_types (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS svc_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  service_type_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(60) NOT NULL,
  name VARCHAR(120) NOT NULL,
  image_key VARCHAR(255) DEFAULT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_svc_categories_type_code (service_type_id, code),
  UNIQUE KEY uq_svc_categories_id_type (id, service_type_id),
  CONSTRAINT fk_svc_categories_type FOREIGN KEY (service_type_id) REFERENCES svc_service_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS svc_category_fields (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category_id BIGINT UNSIGNED NOT NULL,
  field_key VARCHAR(60) NOT NULL,
  label VARCHAR(120) NOT NULL,
  input_type ENUM('TEXT','NUMBER','SELECT','MULTI_SELECT','BOOLEAN') NOT NULL,
  options_json JSON DEFAULT NULL,
  is_required TINYINT(1) NOT NULL DEFAULT 0,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_svc_fields_category_key (category_id, field_key),
  CONSTRAINT fk_svc_fields_category FOREIGN KEY (category_id) REFERENCES svc_categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS svc_enquiries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  enquiry_no VARCHAR(40) NOT NULL,
  service_type_id BIGINT UNSIGNED NOT NULL,
  customer_user_id BIGINT UNSIGNED NOT NULL,
  address_id BIGINT UNSIGNED DEFAULT NULL,
  customer_name VARCHAR(150) NOT NULL,
  customer_mobile VARCHAR(20) NOT NULL,
  city_area VARCHAR(150) NOT NULL,
  pincode VARCHAR(10) NOT NULL,
  address_snapshot JSON DEFAULT NULL,
  pickup_required TINYINT(1) NOT NULL DEFAULT 0,
  customer_notes TEXT,
  status ENUM('NEW','CONTACTED','FOLLOW_UP','CLOSED','CANCELLED') NOT NULL DEFAULT 'NEW',
  next_follow_up_at DATETIME DEFAULT NULL,
  partner_share_consent_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_svc_enquiries_no (enquiry_no),
  UNIQUE KEY uq_svc_enquiries_id_type (id, service_type_id),
  KEY idx_svc_enquiries_customer (customer_user_id, created_at),
  KEY idx_svc_enquiries_status (status, created_at),
  KEY idx_svc_enquiries_follow_up (status, next_follow_up_at),
  CONSTRAINT fk_svc_enquiries_type FOREIGN KEY (service_type_id) REFERENCES svc_service_types(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS svc_enquiry_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  enquiry_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  service_type_id BIGINT UNSIGNED NOT NULL,
  category_name_snapshot VARCHAR(120) NOT NULL,
  item_name VARCHAR(150) NOT NULL,
  quantity SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  answers_json JSON NOT NULL,
  item_notes TEXT,
  KEY idx_svc_items_enquiry (enquiry_id, service_type_id),
  KEY idx_svc_items_category (category_id, service_type_id),
  CONSTRAINT chk_svc_items_quantity CHECK (quantity > 0),
  CONSTRAINT fk_svc_items_enquiry_type FOREIGN KEY (enquiry_id, service_type_id) REFERENCES svc_enquiries(id, service_type_id),
  CONSTRAINT fk_svc_items_category_type FOREIGN KEY (category_id, service_type_id) REFERENCES svc_categories(id, service_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS svc_enquiry_photos (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  enquiry_item_id BIGINT UNSIGNED NOT NULL,
  storage_key VARCHAR(255) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_svc_photos_item (enquiry_item_id, sort_order),
  CONSTRAINT fk_svc_photos_item FOREIGN KEY (enquiry_item_id) REFERENCES svc_enquiry_items(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS svc_enquiry_activities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  enquiry_id BIGINT UNSIGNED NOT NULL,
  staff_user_id INT NOT NULL,
  activity_type ENUM('CALL','NOTE','STATUS_CHANGE') NOT NULL,
  note TEXT,
  from_status ENUM('NEW','CONTACTED','FOLLOW_UP','CLOSED','CANCELLED') DEFAULT NULL,
  to_status ENUM('NEW','CONTACTED','FOLLOW_UP','CLOSED','CANCELLED') DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_svc_activities_enquiry (enquiry_id, created_at),
  CONSTRAINT fk_svc_activities_enquiry FOREIGN KEY (enquiry_id) REFERENCES svc_enquiries(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
