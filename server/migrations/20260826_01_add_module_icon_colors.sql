-- Content Management: module icons get an optional background color per state
-- (normal/active), plus an optional two-stop gradient as an alternative to a
-- flat active color. All four are nullable hex strings (#RGB/#RRGGBB) - when
-- null the CMS/app falls back to whatever default background it already uses.

ALTER TABLE module_icons
  ADD COLUMN normal_color VARCHAR(9) DEFAULT NULL AFTER active_icon_url,
  ADD COLUMN active_color VARCHAR(9) DEFAULT NULL AFTER normal_color,
  ADD COLUMN gradient_start_color VARCHAR(9) DEFAULT NULL AFTER active_color,
  ADD COLUMN gradient_end_color VARCHAR(9) DEFAULT NULL AFTER gradient_start_color;
