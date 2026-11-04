-- PROPOSAL: review before running. NOT applied. Run separately from any code release.
--
-- notification_preferences.marketing_enabled and engagement_enabled default to
-- 1, so a row inserted by hand or by a new code path without those columns
-- would count as consent. The app itself always writes explicit values
-- (NotificationTemplateModel.savePreferences), so nothing depends on this default.
--
-- Changes the column defaults only. Touches no existing row: stored preferences
-- are kept exactly as they are.
--
-- Separate decision, not made here: the table cannot show whether a stored 1
-- came from an explicit opt-in or from these defaults. Review existing rows
-- before any marketing send to real employees; never reset them from this file.
--
-- Rollback:
--   ALTER TABLE notification_preferences
--     ALTER COLUMN marketing_enabled SET DEFAULT 1,
--     ALTER COLUMN engagement_enabled SET DEFAULT 1;
ALTER TABLE notification_preferences
  ALTER COLUMN marketing_enabled SET DEFAULT 0,
  ALTER COLUMN engagement_enabled SET DEFAULT 0;
