const { WebSocketServer, WebSocket } = require("ws");
const jwt = require("jsonwebtoken");
const Chat = require("../models/chatModel");

function setupChatSocket(server, app, isAllowedOrigin) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const clients = new Map();
  const send = (socket, payload) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify(payload));

  function broadcastConversation(conversationId, payload, exceptUserId = null) {
    for (const [socket, state] of clients) {
      if (state.userId !== exceptUserId && state.conversations.has(Number(conversationId))) send(socket, payload);
    }
  }
  function addUsersToConversation(userIds, conversationId) {
    const wanted = new Set(userIds.map(Number));
    for (const [socket, state] of clients) if (wanted.has(Number(state.userId))) {
      state.conversations.add(Number(conversationId));
      send(socket, { type: "conversation:available", data: { conversation_id: Number(conversationId) } });
    }
  }
  function removeUserFromConversation(userId, conversationId) {
    for (const state of clients.values()) if (Number(state.userId) === Number(userId)) state.conversations.delete(Number(conversationId));
  }
  function onlineUserIds(companyId = null) {
    return new Set([...clients.values()]
      .filter((state) => companyId === null || Number(state.companyId) === Number(companyId))
      .map((state) => Number(state.userId)));
  }

  server.on("upgrade", async (request, socket, head) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname !== "/ws/chat") return;
      if (request.headers.origin && !isAllowedOrigin(request.headers.origin)) throw new Error("Origin not allowed");
      const authHeader = request.headers.authorization || "";
      const token = url.searchParams.get("token") || (authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "");
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      const identity = await Chat.identity(decoded.user_id);
      if (!identity) throw new Error("Unauthorized");
      request.chatIdentity = identity;
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
    } catch { socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n"); socket.destroy(); }
  });

  wss.on("connection", async (socket, request) => {
    const userId = request.chatIdentity.user_id;
    const conversations = new Set((await Chat.listConversations(userId)).map((item) => Number(item.conversation_id)));
    clients.set(socket, { userId, companyId: request.chatIdentity.company_id, conversations });
    Chat.setLastSeen(userId).catch(() => {});
    send(socket, { type: "connected", data: { user_id: userId, online_user_ids: [...onlineUserIds(request.chatIdentity.company_id)] } });
    for (const conversationId of conversations) broadcastConversation(conversationId, { type: "presence", data: { user_id: userId, online: true } }, userId);

    socket.on("message", async (buffer) => {
      try {
        const event = JSON.parse(buffer.toString());
        const conversationId = Number(event.conversation_id);
        if (!Number.isSafeInteger(conversationId) || !await Chat.assertMember(userId, conversationId)) throw Object.assign(new Error("Conversation not found"), { code: "NOT_FOUND" });
        clients.get(socket)?.conversations.add(conversationId);
        if (event.type === "typing:start" || event.type === "typing:stop") {
          broadcastConversation(conversationId, { type: event.type, data: { conversation_id: conversationId, user_id: userId } }, userId);
        } else if (event.type === "message:read") {
          await Chat.markRead(userId, conversationId, Number(event.message_id));
          broadcastConversation(conversationId, { type: "message:read", data: { conversation_id: conversationId, message_id: Number(event.message_id), user_id: userId } });
        } else if (event.type === "message:send") {
          const messageType = event.message_type || "text";
          const body = typeof event.body === "string" ? event.body.trim() : "";
          if (!["text", "image", "file"].includes(messageType)
            || (messageType === "text" && (!body || body.length > 5000))
            || (messageType !== "text" && !event.attachment_url)) {
            throw Object.assign(new Error("Invalid message"), { code: "VALIDATION_ERROR" });
          }
          const message = await Chat.sendMessage(userId, conversationId, {
            messageType, body, attachmentUrl: event.attachment_url, attachmentName: event.attachment_name,
            attachmentMimeType: event.attachment_mime_type, replyTo: event.reply_to_message_id ? Number(event.reply_to_message_id) : null,
            clientMessageId: event.client_message_id ? String(event.client_message_id).slice(0, 64) : null,
          });
          broadcastConversation(conversationId, { type: "message:new", data: message });
        } else throw Object.assign(new Error("Unsupported event type"), { code: "UNSUPPORTED_EVENT" });
      } catch (error) { send(socket, { type: "error", data: { code: error.code || "BAD_EVENT", message: error.message || "Invalid event" } }); }
    });

    socket.on("close", () => {
      const state = clients.get(socket); clients.delete(socket);
      const stillOnline = [...clients.values()].some((client) => Number(client.userId) === Number(userId));
      if (state && !stillOnline) {
        const lastSeenAt = new Date();
        Chat.setLastSeen(userId, lastSeenAt).catch(() => {});
        for (const conversationId of state.conversations) broadcastConversation(conversationId, { type: "presence", data: { user_id: userId, online: false, last_seen_at: lastSeenAt.toISOString() } }, userId);
      }
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of clients.keys()) {
      if (socket.isAlive === false) socket.terminate(); else { socket.isAlive = false; socket.ping(); }
    }
  }, 30000);
  wss.on("connection", (socket) => { socket.isAlive = true; socket.on("pong", () => { socket.isAlive = true; }); });
  wss.on("close", () => clearInterval(heartbeat));
  app.locals.chatSocket = { broadcastConversation, addUsersToConversation, removeUserFromConversation, onlineUserIds };
  return wss;
}

module.exports = setupChatSocket;
