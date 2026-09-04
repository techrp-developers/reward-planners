-- Module icons: a distinct Dashboard icon, separate from the Navbar normal/active pair
-- (icon_url/active_icon_url). Nullable - when unset, the CMS/app falls back to icon_url
-- as the dashboard preview without ever writing that fallback back to this column.

ALTER TABLE module_icons
  ADD COLUMN dashboard_icon_url VARCHAR(500) DEFAULT NULL AFTER active_icon_url;
