const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

test("large campaigns queue every eligible recipient across pages and safely resume", async () => {
  const customers = Array.from({ length: 1001 }, (_, i) => ({
    user_id: i + 1, name: `Customer ${i}`, phone: String(9000000000 + i),
  }));
  customers.push({ user_id: 1002, name: "Duplicate", phone: customers[0].phone });
  customers.push({ user_id: 1003, name: "Invalid", phone: "123" });
  const queued = new Set();
  let failOnce = true;
  let pages = 0;
  const context = {
    module: { exports: {} }, console,
    require(name) {
      if (name.endsWith("database")) return { query: async (sql, [companies, after]) => {
        assert.deepEqual(Array.from(companies), [17, 16, 13, 8, 7, 6, 5, 4, 2, 1]);
        assert.match(sql, /company_id IN \(\?\)/);
        assert.match(sql, /LIMIT 250/);
        pages++;
        return [customers.filter(c => c.user_id > after).slice(0, 250)];
      } };
      if (name.endsWith("/phone")) return require("../services/whatsapp/phone");
      if (name.endsWith("waEnqueueService")) return { enqueueWhatsApp: async ({ ctx }) => {
        if (ctx.customer_name === "Customer 500" && failOnce) {
          failOnce = false;
          return { ok: false, reason: "QUEUE_ERROR" };
        }
        if (queued.has(ctx.idempotency_key)) return { ok: true, duplicate: true };
        queued.add(ctx.idempotency_key);
        return { ok: true, queued: true };
      } };
      throw new Error(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../app/common/controller/communityInvitationController.js"), "utf8"), context);
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await context.module.exports.english({}, res);
  assert.equal(res.code, 503);
  assert.equal(res.body.data.total, 1003);
  assert.equal(res.body.data.queued, 1000);
  assert.equal(res.body.data.failed, 1);
  assert.equal(res.body.data.skipped_invalid, 1);
  assert.equal(res.body.data.skipped_duplicate, 1);
  assert.equal(pages, 6);
  await context.module.exports.english({}, res);
  assert.equal(res.code, 202);
  assert.equal(res.body.data.queued, 1);
  assert.equal(res.body.data.skipped_duplicate, 1001);
  assert.equal(queued.size, 1001);
});
