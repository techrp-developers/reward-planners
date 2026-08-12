-- Support phone-only signup (no password) and refresh-token storage for phone login.
ALTER TABLE customer ADD COLUMN refresh_token TEXT NULL;
ALTER TABLE customer MODIFY password VARCHAR(255) NULL;
