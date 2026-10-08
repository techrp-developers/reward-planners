const db = require("../../../config/database");

class ChatModel {
  async identity(userId, conn = db) {
    const [rows] = await conn.execute(
      `SELECT c.user_id, c.name, c.user_image, cu.company_id
       FROM customer c JOIN company_users cu ON cu.id = c.company_user_id
       WHERE c.user_id = ? AND c.status = 1 AND cu.status = 1 LIMIT 1`, [userId]);
    return rows[0] || null;
  }

  async companyUsers(userId, search = "") {
    const me = await this.identity(userId);
    if (!me) return [];
    const term = `%${search}%`;
    const [rows] = await db.execute(
      `SELECT c.user_id, c.name, c.user_image, cu.department, cu.role
       FROM customer c JOIN company_users cu ON cu.id = c.company_user_id
       WHERE cu.company_id = ? AND c.status = 1 AND cu.status = 1 AND c.user_id <> ?
         AND (? = '%%' OR c.name LIKE ?)
       ORDER BY c.name LIMIT 100`, [me.company_id, userId, term, term]);
    return rows;
  }

  async assertMember(userId, conversationId, conn = db) {
    const [rows] = await conn.execute(
      `SELECT m.role, c.company_id, c.type FROM chat_members m
       JOIN chat_conversations c ON c.conversation_id = m.conversation_id
       WHERE m.conversation_id = ? AND m.user_id = ? AND m.left_at IS NULL LIMIT 1`,
      [conversationId, userId]);
    return rows[0] || null;
  }

  async createConversation(userId, data) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const me = await this.identity(userId, conn);
      if (!me) throw Object.assign(new Error("An active company membership is required"), { status: 403 });
      const memberIds = [...new Set([userId, ...data.memberIds])];
      const placeholders = memberIds.map(() => "?").join(",");
      const [valid] = await conn.execute(
        `SELECT c.user_id FROM customer c JOIN company_users cu ON cu.id = c.company_user_id
         WHERE c.user_id IN (${placeholders}) AND c.status = 1 AND cu.status = 1 AND cu.company_id = ?`,
        [...memberIds, me.company_id]);
      if (valid.length !== memberIds.length) throw Object.assign(new Error("Every member must belong to your company"), { status: 422 });
      if (data.type === "direct" && memberIds.length !== 2) throw Object.assign(new Error("A direct chat requires exactly one other user"), { status: 422 });
      if (data.type === "group" && memberIds.length < 2) throw Object.assign(new Error("A group requires at least two members"), { status: 422 });
      const directKey = data.type === "direct" ? memberIds.slice().sort((a, b) => a - b).join(":") : null;
      let conversationId;
      try {
        const [result] = await conn.execute(
          `INSERT INTO chat_conversations (company_id, type, name, description, created_by, direct_key)
           VALUES (?, ?, ?, ?, ?, ?)`, [me.company_id, data.type, data.name || null, data.description || null, userId, directKey]);
        conversationId = result.insertId;
      } catch (error) {
        if (error.code !== "ER_DUP_ENTRY" || !directKey) throw error;
        const [[existing]] = await conn.execute(
          `SELECT conversation_id FROM chat_conversations WHERE company_id = ? AND direct_key = ?`, [me.company_id, directKey]);
        conversationId = existing.conversation_id;
        await conn.execute(`UPDATE chat_members SET left_at = NULL WHERE conversation_id = ? AND user_id IN (${placeholders})`, [conversationId, ...memberIds]);
      }
      for (const memberId of memberIds) {
        await conn.execute(
          `INSERT IGNORE INTO chat_members (conversation_id, user_id, role) VALUES (?, ?, ?)`,
          [conversationId, memberId, data.type === "group" && memberId === userId ? "admin" : "member"]);
      }
      await conn.commit();
      return conversationId;
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
  }

  async listConversations(userId) {
    const [rows] = await db.execute(
      `SELECT c.conversation_id, c.type, c.name, c.description, c.updated_at, m.role,
              lm.message_id AS last_message_id, lm.body AS last_message, lm.message_type AS last_message_type,
              lm.created_at AS last_message_at, lm.sender_id AS last_sender_id,
              (SELECT COUNT(*) FROM chat_messages um WHERE um.conversation_id = c.conversation_id
                 AND um.message_id > COALESCE(m.last_read_message_id, 0) AND um.sender_id <> ?) AS unread_count
       FROM chat_members m JOIN chat_conversations c ON c.conversation_id = m.conversation_id
       LEFT JOIN chat_messages lm ON lm.message_id = (SELECT MAX(x.message_id) FROM chat_messages x WHERE x.conversation_id = c.conversation_id)
       WHERE m.user_id = ? AND m.left_at IS NULL ORDER BY COALESCE(lm.created_at, c.created_at) DESC`, [userId, userId]);
    for (const row of rows) {
      const [members] = await db.execute(
        `SELECT u.user_id, u.name, u.user_image, cm.role,
                cu.department, cu.role AS job_role
         FROM chat_members cm
         JOIN customer u ON u.user_id = cm.user_id
         JOIN company_users cu ON cu.id = u.company_user_id
         WHERE cm.conversation_id = ? AND cm.left_at IS NULL`, [row.conversation_id]);
      row.members = members;
    }
    return rows;
  }

  async messages(userId, conversationId, beforeId, limit) {
    if (!await this.assertMember(userId, conversationId)) throw Object.assign(new Error("Conversation not found"), { status: 404 });
    const [rows] = await db.execute(
      `SELECT m.message_id, m.conversation_id, m.sender_id, u.name AS sender_name, u.user_image AS sender_image,
              m.client_message_id, m.message_type, m.body, m.attachment_url, m.attachment_name,
              m.attachment_mime_type, m.reply_to_message_id, m.edited_at, m.deleted_at, m.created_at
       FROM chat_messages m JOIN customer u ON u.user_id = m.sender_id
       WHERE m.conversation_id = ? AND (? IS NULL OR m.message_id < ?)
       ORDER BY m.message_id DESC LIMIT ?`, [conversationId, beforeId, beforeId, limit]);
    rows.reverse();
    if (!rows.length) return rows;
    const messageIds = rows.map((row) => row.message_id);
    const marks = messageIds.map(() => "?").join(",");
    const [receipts] = await db.execute(
      `SELECT m.message_id, reader.user_id, reader.name, cm.last_read_message_id
       FROM chat_messages m
       JOIN chat_members cm ON cm.conversation_id = m.conversation_id
         AND cm.user_id <> m.sender_id AND cm.left_at IS NULL AND cm.last_read_message_id >= m.message_id
       JOIN customer reader ON reader.user_id = cm.user_id
       WHERE m.message_id IN (${marks})`, messageIds);
    const byMessage = new Map();
    for (const receipt of receipts) {
      if (!byMessage.has(Number(receipt.message_id))) byMessage.set(Number(receipt.message_id), []);
      byMessage.get(Number(receipt.message_id)).push({ user_id: receipt.user_id, name: receipt.name });
    }
    const serialized = rows.map((row) => ({
      ...row,
      read_by: byMessage.get(Number(row.message_id)) || [],
      is_read: (byMessage.get(Number(row.message_id)) || []).length > 0,
    }));
    await this.attachPolls(serialized, userId);
    return serialized;
  }

  async attachPolls(messages, userId, conn = db) {
    const pollMessages = messages.filter((message) => message.message_type === "poll");
    if (!pollMessages.length) return messages;
    const marks = pollMessages.map(() => "?").join(",");
    const [rows] = await conn.execute(
      `SELECT p.poll_id, p.message_id, p.question, p.allow_multiple, p.closes_at,
              o.option_id, o.option_text, o.display_order,
              COUNT(v.user_id) AS vote_count,
              MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS selected_by_me
       FROM chat_polls p JOIN chat_poll_options o ON o.poll_id = p.poll_id
       LEFT JOIN chat_poll_votes v ON v.poll_id = p.poll_id AND v.option_id = o.option_id
       WHERE p.message_id IN (${marks})
       GROUP BY p.poll_id, p.message_id, p.question, p.allow_multiple, p.closes_at,
                o.option_id, o.option_text, o.display_order
       ORDER BY o.display_order`, [userId, ...pollMessages.map((message) => message.message_id)]);
    const polls = new Map();
    for (const row of rows) {
      if (!polls.has(Number(row.message_id))) polls.set(Number(row.message_id), {
        poll_id: row.poll_id, question: row.question, allow_multiple: Boolean(row.allow_multiple),
        closes_at: row.closes_at, options: [],
      });
      polls.get(Number(row.message_id)).options.push({
        option_id: row.option_id, text: row.option_text, vote_count: Number(row.vote_count), selected_by_me: Boolean(row.selected_by_me),
      });
    }
    for (const message of pollMessages) message.poll = polls.get(Number(message.message_id)) || null;
    return messages;
  }

  async createPoll(userId, conversationId, data) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      if (!await this.assertMember(userId, conversationId, conn)) throw Object.assign(new Error("Conversation not found"), { status: 404 });
      const [messageResult] = await conn.execute(
        `INSERT INTO chat_messages (conversation_id, sender_id, client_message_id, message_type, body)
         VALUES (?, ?, ?, 'poll', ?)`, [conversationId, userId, data.clientMessageId || null, data.question]);
      const [pollResult] = await conn.execute(
        `INSERT INTO chat_polls (message_id, question, allow_multiple, closes_at) VALUES (?, ?, ?, ?)`,
        [messageResult.insertId, data.question, data.allowMultiple ? 1 : 0, data.closesAt || null]);
      for (let index = 0; index < data.options.length; index += 1) {
        await conn.execute(`INSERT INTO chat_poll_options (poll_id, option_text, display_order) VALUES (?, ?, ?)`, [pollResult.insertId, data.options[index], index]);
      }
      await conn.execute(`UPDATE chat_conversations SET updated_at = NOW() WHERE conversation_id = ?`, [conversationId]);
      const [[message]] = await conn.execute(
        `SELECT m.*, u.name AS sender_name, u.user_image AS sender_image FROM chat_messages m JOIN customer u ON u.user_id=m.sender_id WHERE m.message_id=?`, [messageResult.insertId]);
      message.read_by = []; message.is_read = false;
      await this.attachPolls([message], userId, conn);
      await conn.commit();
      return message;
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
  }

  async votePoll(userId, pollId, optionIds) {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[poll]] = await conn.execute(
        `SELECT p.poll_id, p.message_id, p.allow_multiple, p.closes_at, m.conversation_id
         FROM chat_polls p JOIN chat_messages m ON m.message_id = p.message_id WHERE p.poll_id = ? FOR UPDATE`, [pollId]);
      if (!poll || !await this.assertMember(userId, poll?.conversation_id, conn)) throw Object.assign(new Error("Poll not found"), { status: 404 });
      if (poll.closes_at && new Date(poll.closes_at).getTime() <= Date.now()) throw Object.assign(new Error("This poll is closed"), { status: 409 });
      if (!poll.allow_multiple && optionIds.length !== 1) throw Object.assign(new Error("Select exactly one option"), { status: 422 });
      const marks = optionIds.map(() => "?").join(",");
      const [valid] = await conn.execute(`SELECT option_id FROM chat_poll_options WHERE poll_id = ? AND option_id IN (${marks})`, [pollId, ...optionIds]);
      if (valid.length !== optionIds.length) throw Object.assign(new Error("Invalid poll option"), { status: 422 });
      await conn.execute(`DELETE FROM chat_poll_votes WHERE poll_id = ? AND user_id = ?`, [pollId, userId]);
      for (const optionId of optionIds) await conn.execute(`INSERT INTO chat_poll_votes (poll_id, option_id, user_id) VALUES (?, ?, ?)`, [pollId, optionId, userId]);
      const [[message]] = await conn.execute(`SELECT * FROM chat_messages WHERE message_id = ?`, [poll.message_id]);
      await this.attachPolls([message], userId, conn);
      await conn.commit();
      return { conversationId: poll.conversation_id, message };
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
  }

  async sendMessage(userId, conversationId, data) {
    if (!await this.assertMember(userId, conversationId)) throw Object.assign(new Error("Conversation not found"), { status: 404 });
    if (data.replyTo) {
      const [[reply]] = await db.execute(`SELECT message_id FROM chat_messages WHERE message_id = ? AND conversation_id = ?`, [data.replyTo, conversationId]);
      if (!reply) throw Object.assign(new Error("Reply target is not in this conversation"), { status: 422 });
    }
    try {
      const [result] = await db.execute(
        `INSERT INTO chat_messages (conversation_id, sender_id, client_message_id, message_type, body, attachment_url, attachment_name, attachment_mime_type, reply_to_message_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [conversationId, userId, data.clientMessageId || null, data.messageType, data.body || null, data.attachmentUrl || null, data.attachmentName || null, data.attachmentMimeType || null, data.replyTo || null]);
      await db.execute(`UPDATE chat_conversations SET updated_at = NOW() WHERE conversation_id = ?`, [conversationId]);
      const [rows] = await db.execute(
        `SELECT m.*, u.name AS sender_name, u.user_image AS sender_image FROM chat_messages m JOIN customer u ON u.user_id=m.sender_id WHERE m.message_id=?`, [result.insertId]);
      return { ...rows[0], read_by: [], is_read: false };
    } catch (error) {
      if (error.code !== "ER_DUP_ENTRY" || !data.clientMessageId) throw error;
      const [rows] = await db.execute(`SELECT m.*, u.name AS sender_name, u.user_image AS sender_image FROM chat_messages m JOIN customer u ON u.user_id=m.sender_id WHERE m.sender_id=? AND m.client_message_id=?`, [userId, data.clientMessageId]);
      return { ...rows[0], read_by: [], is_read: false };
    }
  }

  async markRead(userId, conversationId, messageId) {
    if (!await this.assertMember(userId, conversationId)) throw Object.assign(new Error("Conversation not found"), { status: 404 });
    const [[message]] = await db.execute(`SELECT message_id FROM chat_messages WHERE message_id = ? AND conversation_id = ?`, [messageId, conversationId]);
    if (!message) throw Object.assign(new Error("Message not found"), { status: 404 });
    await db.execute(`UPDATE chat_members SET last_read_message_id = GREATEST(COALESCE(last_read_message_id, 0), ?) WHERE conversation_id = ? AND user_id = ?`, [messageId, conversationId, userId]);
  }

  async setLastSeen(userId, date = new Date()) {
    await db.execute(
      `INSERT INTO chat_presence (user_id, last_seen_at) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE last_seen_at = VALUES(last_seen_at)`, [userId, date]);
  }

  async presence(userId, requestedIds) {
    const me = await this.identity(userId);
    if (!me || !requestedIds.length) return [];
    const marks = requestedIds.map(() => "?").join(",");
    const [rows] = await db.execute(
      `SELECT c.user_id, p.last_seen_at FROM customer c
       JOIN company_users cu ON cu.id = c.company_user_id
       LEFT JOIN chat_presence p ON p.user_id = c.user_id
       WHERE c.user_id IN (${marks}) AND cu.company_id = ? AND c.status = 1 AND cu.status = 1`,
      [...requestedIds, me.company_id]);
    return rows;
  }

  async updateGroup(userId, conversationId, data) {
    const member = await this.assertMember(userId, conversationId);
    if (!member || member.type !== "group") throw Object.assign(new Error("Group not found"), { status: 404 });
    if (member.role !== "admin") throw Object.assign(new Error("Group admin permission required"), { status: 403 });
    await db.execute(`UPDATE chat_conversations SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE conversation_id = ?`, [data.name ?? null, data.description ?? null, conversationId]);
  }

  async addMembers(userId, conversationId, memberIds) {
    const admin = await this.assertMember(userId, conversationId);
    if (!admin || admin.type !== "group") throw Object.assign(new Error("Group not found"), { status: 404 });
    if (admin.role !== "admin") throw Object.assign(new Error("Group admin permission required"), { status: 403 });
    const ids = [...new Set(memberIds)];
    if (!ids.length) return;
    const marks = ids.map(() => "?").join(",");
    const [valid] = await db.execute(
      `SELECT c.user_id FROM customer c JOIN company_users cu ON cu.id=c.company_user_id WHERE c.user_id IN (${marks}) AND c.status=1 AND cu.status=1 AND cu.company_id=?`, [...ids, admin.company_id]);
    if (valid.length !== ids.length) throw Object.assign(new Error("Every member must belong to your company"), { status: 422 });
    for (const id of ids) await db.execute(`INSERT INTO chat_members (conversation_id,user_id,role,left_at) VALUES (?,?,'member',NULL) ON DUPLICATE KEY UPDATE left_at=NULL`, [conversationId, id]);
  }

  async removeMember(userId, conversationId, targetId) {
    const actor = await this.assertMember(userId, conversationId);
    if (!actor) throw Object.assign(new Error("Conversation not found"), { status: 404 });
    if (userId !== targetId && actor.role !== "admin") throw Object.assign(new Error("Group admin permission required"), { status: 403 });
    await db.execute(`UPDATE chat_members SET left_at=NOW() WHERE conversation_id=? AND user_id=?`, [conversationId, targetId]);
  }
}

module.exports = new ChatModel();
