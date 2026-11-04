-- Migration: 20260929_01_create_chat.sql
-- Creates schema for company chat: conversations, members, messages, presence, and polls.

CREATE TABLE IF NOT EXISTS chat_conversations (
  conversation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id INT NOT NULL,
  type ENUM('direct', 'group') NOT NULL DEFAULT 'direct',
  name VARCHAR(255) NULL,
  description TEXT NULL,
  image_url VARCHAR(500) NULL,
  created_by INT NOT NULL,
  direct_key VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (conversation_id),
  UNIQUE KEY uq_chat_conversations_company_direct_key (company_id, direct_key),
  KEY idx_chat_conversations_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_members (
  conversation_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  role ENUM('admin', 'member') NOT NULL DEFAULT 'member',
  last_read_message_id BIGINT UNSIGNED NULL DEFAULT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at DATETIME NULL DEFAULT NULL,
  PRIMARY KEY (conversation_id, user_id),
  KEY idx_chat_members_user (user_id),
  CONSTRAINT fk_chat_members_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations(conversation_id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_members_user FOREIGN KEY (user_id) REFERENCES customer(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
  message_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_id INT NOT NULL,
  client_message_id VARCHAR(64) NULL,
  message_type ENUM('text', 'image', 'document', 'poll', 'file') NOT NULL DEFAULT 'text',
  body TEXT NULL,
  attachment_url VARCHAR(500) NULL,
  attachment_name VARCHAR(255) NULL,
  attachment_mime_type VARCHAR(100) NULL,
  reply_to_message_id BIGINT UNSIGNED NULL,
  edited_at DATETIME NULL,
  deleted_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id),
  UNIQUE KEY uq_chat_messages_sender_client (sender_id, client_message_id),
  KEY idx_chat_messages_conv_msg (conversation_id, message_id),
  CONSTRAINT fk_chat_messages_conversation FOREIGN KEY (conversation_id) REFERENCES chat_conversations(conversation_id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_messages_sender FOREIGN KEY (sender_id) REFERENCES customer(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_presence (
  user_id INT NOT NULL,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_chat_presence_user FOREIGN KEY (user_id) REFERENCES customer(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_polls (
  poll_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  message_id BIGINT UNSIGNED NOT NULL,
  question VARCHAR(500) NOT NULL,
  allow_multiple TINYINT(1) NOT NULL DEFAULT 0,
  closes_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (poll_id),
  UNIQUE KEY uq_chat_polls_message (message_id),
  CONSTRAINT fk_chat_polls_message FOREIGN KEY (message_id) REFERENCES chat_messages(message_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_poll_options (
  option_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  poll_id BIGINT UNSIGNED NOT NULL,
  option_text VARCHAR(255) NOT NULL,
  display_order SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (option_id),
  UNIQUE KEY uq_chat_poll_options_order (poll_id, display_order),
  CONSTRAINT fk_chat_poll_options_poll FOREIGN KEY (poll_id) REFERENCES chat_polls(poll_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_poll_votes (
  vote_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  poll_id BIGINT UNSIGNED NOT NULL,
  option_id BIGINT UNSIGNED NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (vote_id),
  UNIQUE KEY uq_chat_poll_votes (poll_id, option_id, user_id),
  KEY idx_chat_poll_votes_user (user_id, poll_id),
  CONSTRAINT fk_chat_poll_votes_poll FOREIGN KEY (poll_id) REFERENCES chat_polls(poll_id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_poll_votes_option FOREIGN KEY (option_id) REFERENCES chat_poll_options(option_id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_poll_votes_user FOREIGN KEY (user_id) REFERENCES customer(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
