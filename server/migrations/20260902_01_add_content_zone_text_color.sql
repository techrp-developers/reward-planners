-- Content Management: lets an admin pin the navbar_background header text color
-- (greeting name, subtitle, search placeholder) so it stays readable against
-- whatever background color/gradient/image they pick for a zone entry.
-- Nullable and opt-in - existing rows (product/service/payment/dineout) are
-- untouched, and the frontend falls back to its own default (white) when unset.

ALTER TABLE content_zone_entries
  ADD COLUMN text_color VARCHAR(9) NULL AFTER color_value;
