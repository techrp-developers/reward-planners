const db = require("../../../config/database");
const { notifyUser } = require("../../common/utils/notification");

const PREVIEW_LENGTH = 120;

function messagePreview(message) {
  if (message.message_type === "image") return "Sent a photo";
  if (message.message_type === "file") return `Sent a file${message.attachment_name ? `: ${message.attachment_name}` : ""}`;
  if (message.message_type === "poll") return `Poll: ${message.body || "New poll"}`;
  const body = String(message.body || "").trim();
  if (!body) return "You received a new message.";
  return body.length > PREVIEW_LENGTH ? `${body.slice(0, PREVIEW_LENGTH - 1)}…` : body;
}

async function notifyMessageRecipients(message) {
  if (!message?.message_id || !message.conversation_id) return;
  const [members] = await db.execute(
    `SELECT user_id FROM chat_members
     WHERE conversation_id = ? AND left_at IS NULL AND user_id <> ?`,
    [message.conversation_id, message.sender_id],
  );
  const preview = messagePreview(message);
  for (const member of members) {
    notifyUser({
      userId: member.user_id,
      module: "common",
      type: "chat_message",
      title: message.sender_name || "New chat message",
      message: preview,
      reference_type: "none",
      reference_id: message.conversation_id,
      // One push per message per recipient, even if the sender retries with the same client_message_id.
      idempotency_key: `chat:${message.message_id}:${member.user_id}`,
      priority: "high",
    }, "chat_message_notification");
  }
}

module.exports = { notifyMessageRecipients };
