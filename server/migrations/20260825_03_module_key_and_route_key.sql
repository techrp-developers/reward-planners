-- Content Management: turn module_icons into a real "create new module" resource.
-- Renames `module` -> `module_key` (clearer now that admins can create arbitrary
-- new keys, not just the original 4) and adds `route_key`, which the CMS never
-- writes - it stays null until the mobile app actually implements a screen for
-- that module, so a newly-created module can be displayed without ever
-- fabricating a React Navigation route the app doesn't have.

ALTER TABLE module_icons
  CHANGE COLUMN module module_key VARCHAR(50) NOT NULL,
  ADD COLUMN route_key VARCHAR(100) DEFAULT NULL AFTER active_icon_url;

UPDATE module_icons SET route_key = 'ProductModule' WHERE module_key = 'product';
UPDATE module_icons SET route_key = 'ServicesModule' WHERE module_key = 'service';
UPDATE module_icons SET route_key = 'PaymentsModule' WHERE module_key = 'payment';
UPDATE module_icons SET route_key = 'DineOutModule' WHERE module_key = 'dineout';
