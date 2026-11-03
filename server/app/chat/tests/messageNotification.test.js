const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function setup(notify = async () => {}) {
  const queries = [];
  const sent = [];
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("../services/messageNotification"), "utf8"), {
    module,
    require(name) {
      if (name === "../../../config/database") return { execute: async (sql, args) => {
        queries.push({ sql, args });
        return [[{ user_id: 8 }, { user_id: 9 }]];
      } };
      if (name === "../../common/utils/notification") return { notifyUserAndWait: async (data) => {
        sent.push(data);
        return notify(data);
      } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { ...module.exports, queries, sent };
}
const message = { message_id: 12, conversation_id: 7, sender_id: 3, sender_name: "Sam", body: "Happy birthday!" };

test("notifies active recipients with stable per-message retry keys", async () => {
  const { notifyMessageRecipients, queries, sent } = setup();
  await notifyMessageRecipients(message);
  await notifyMessageRecipients(message);
  assert.match(queries[0].sql, /m.user_id <> \?/);
  assert.match(queries[0].sql, /m.left_at IS NULL/);
  assert.match(queries[0].sql, /cu.company_id = conv.company_id/);
  assert.equal(queries[0].args[0], 7);
  assert.equal(queries[0].args[1], 3);
  assert.equal(sent.length, 4);
  assert.equal(sent[0].idempotency_key, "chat-message:12:8");
  assert.equal(sent[0].idempotency_key, sent[2].idempotency_key);
  assert.equal(sent[0].message, message.body);
});

test("skips missing and deleted messages", async () => {
  const { notifyMessageRecipients, queries } = setup();
  await notifyMessageRecipients(null);
  await notifyMessageRecipients({ ...message, deleted_at: "2026-10-23" });
  assert.equal(queries.length, 0);
});

test("attempts all recipients even when one notification fails", async () => {
  const { notifyMessageRecipients, sent } = setup(async ({ userId }) => {
    if (userId === 8) throw new Error("Notification unavailable");
  });
  await assert.rejects(notifyMessageRecipients(message), /Notification unavailable/);
  assert.equal(sent.length, 2);
});
