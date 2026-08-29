-- Content Management: gradients are stored as JSON in the existing color_value
-- field to keep the CMS generic and backward-compatible with legacy HEX values.

ALTER TABLE content_zone_entries
  MODIFY COLUMN color_value VARCHAR(500) NULL;
