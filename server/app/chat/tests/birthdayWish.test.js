const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(relative, dependencies) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, relative), "utf8"), {
    module, exports: module.exports,
    require: (name) => dependencies[name] || {},
  });
  return module.exports;
}

function setup() {
  const calls = [];
  const chat = {
    birthdayRecipient: async (...args) => { calls.push(["recipient", ...args]); return { user_id: 91 }; },
    createConversation: async (sender, data) => { calls.push(["create", sender, data]); return 7; },
    sendMessage: async (sender, conversation, data) => {
      calls.push(["send", sender, conversation, data]);
      return { message_id: 12, conversation_id: conversation, body: data.body };
    },
  };
  const controller = load("../controller/chatController.js", {
    "../models/chatModel": chat, crypto: require("node:crypto"),
  });
  const req = { user: { user_id: 3 }, body: { employee_id: 42 }, app: { locals: {
    chatSocket: {
      addUsersToConversation: (...args) => calls.push(["join", ...args]),
      broadcastConversation: (...args) => calls.push(["broadcast", ...args]),
    },
  } } };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; } };
  return { controller, chat, calls, req, res };
}

test("resolves birthday employee ID, persists a direct wish and joins sockets before broadcasting", async () => {
  const { controller, calls, req, res } = setup();
  await controller.sendBirthdayWish(req, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.conversation_id, 7);
  assert.deepEqual(calls.map((call) => call[0]), ["recipient", "create", "send", "join", "broadcast"]);
  assert.equal(calls[0][2], 42);
  assert.equal(calls[1][2].memberIds[0], 91);
  assert.match(calls[2][3].body, /Happy birthday/);
});

test("validates input before creating a conversation", async () => {
  for (const body of [{}, { employee_id: true }, { employee_id: -1 }, { employee_id: [] },
    { employee_id: 42, body: " " }, { employee_id: 42, body: "a".repeat(5001) },
    { employee_id: 42, client_message_id: 123 }]) {
    const { controller, calls, req, res } = setup();
    req.body = body;
    await controller.sendBirthdayWish(req, res);
    assert.equal(res.statusCode, 422);
    assert.equal(calls.length, 0);
  }
});

test("custom wishes work without a socket server and retry keys are stable", async () => {
  const { controller, calls, req, res } = setup();
  req.app.locals = {};
  req.body = { employee_id: "42", body: " Happy birthday Sam! ", client_message_id: "mobile-uuid" };
  await controller.sendBirthdayWish(req, res);
  await controller.sendBirthdayWish(req, res);
  const sends = calls.filter((call) => call[0] === "send");
  assert.equal(res.statusCode, 201);
  assert.equal(sends[0][3].body, "Happy birthday Sam!");
  assert.equal(sends[0][3].clientMessageId, sends[1][3].clientMessageId);
  assert.equal(sends[0][3].clientMessageId.length, 64);
});

test("recipient lookup scopes employee to sender company and rejects unavailable/self accounts", async () => {
  let recipient;
  const chat = load("../models/chatModel.js", { "../../../config/database": {
    execute: async (sql, params) => {
      assert.match(sql, /cu.company_id = \?/);
      assert.match(sql, /cu.status = 1 AND c.status = 1/);
      assert.equal(params[0], 42);
      assert.equal(params[1], 8);
      return [[recipient].filter(Boolean)];
    },
  } });
  chat.identity = async () => ({ company_id: 8 });
  await assert.rejects(chat.birthdayRecipient(3, 42), { status: 404 });
  recipient = { user_id: 3 };
  await assert.rejects(chat.birthdayRecipient(3, 42), { status: 422 });
  recipient = { user_id: 91 };
  assert.equal((await chat.birthdayRecipient(3, 42)).user_id, 91);
  chat.identity = async () => null;
  await assert.rejects(chat.birthdayRecipient(3, 42), { status: 403 });
});

test("recipient errors are returned without sending or broadcasting", async () => {
  const { controller, chat, calls, req, res } = setup();
  chat.birthdayRecipient = async () => { throw Object.assign(new Error("Unavailable"), { status: 404 }); };
  await controller.sendBirthdayWish(req, res);
  assert.equal(res.statusCode, 404);
  assert.equal(calls.length, 0);
});
