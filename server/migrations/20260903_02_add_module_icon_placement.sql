-- Module icons: which surface(s) render this module - dashboard, navbar, or both.
-- 'both' (the default) preserves existing behavior for every current row, so no
-- backfill is needed.

ALTER TABLE module_icons
  ADD COLUMN placement ENUM('both', 'dashboard', 'navbar') NOT NULL DEFAULT 'both' AFTER module_key;
