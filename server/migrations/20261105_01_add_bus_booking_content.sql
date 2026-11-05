-- Enable Bus Booking CMS entries while retaining all existing module values.
ALTER TABLE content_zone_entries
  MODIFY COLUMN module ENUM('product','service','payment','dineout','mobile_dashboard','bus_booking')
  COLLATE utf8mb4_unicode_ci NOT NULL;
