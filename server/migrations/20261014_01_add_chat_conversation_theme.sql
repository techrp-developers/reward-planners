-- Shared chat theme, chosen by any member and shown to everyone in the conversation.
-- Keys must match the app's chat theme presets (chatThemes.ts).
ALTER TABLE chat_conversations
  ADD COLUMN theme_key ENUM('default', 'violet', 'ocean', 'forest', 'sunset') NOT NULL DEFAULT 'default' AFTER description;
