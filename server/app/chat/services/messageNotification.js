const db = require("../../../config/database");
const { notifyUserAndWait } = require("../../common/utils/notification");

async function notifyMessageRecipients(message) {
  if (!message?.message_id || !message.conversation_id || !message.sender_id || message.deleted_at) return;

  const [recipients] = await db.execute(
    `SELECT DISTINCT m.user_id FROM chat_members m
     JOIN chat_conversations conv ON conv.conversation_id = m.conversation_id
     JOIN customer c ON c.user_id = m.user_id
     JOIN company_users cu ON cu.id = c.company_user_id
     WHERE m.conversation_id = ? AND m.user_id <> ? AND m.left_at IS NULL
       AND c.status = 1 AND cu.status = 1 AND cu.company_id = conv.company_id`,
    [message.conversation_id, message.sender_id],
  );

  const results = await Promise.allSettled(recipients.map(({ user_id }) => notifyUserAndWait({
    userId: user_id,
    module: "chat",
    type: "chat_message",
    title: message.sender_name || "New chat message",
    message: String(message.body || "You received a new message").slice(0, 500),
    icon: "message-circle",
    reference_type: "conversation",
    reference_id: String(message.conversation_id),
    idempotency_key: `chat-message:${message.message_id}:${user_id}`,
    action_url: "/notifications",
    screen: "Notifications",
    metadata: {
      conversation_id: message.conversation_id,
      message_id: message.message_id,
      sender_user_id: message.sender_id,
    },
  })));
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
  return results;
}

module.exports = { notifyMessageRecipients };
