const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

// Never touch MySQL or Firebase: replace the shared pool and the Firebase
// config before any model or controller is loaded. Each test scripts the
// fake database by matching SQL text.
const queries = [];
let respond = () => [[]];
const fakeDb = {
  query: async (sql, params) => { queries.push({ sql, params }); return respond(sql, params); },
  execute: async (sql, params) => { queries.push({ sql, params }); return respond(sql, params); },
};
const stub = (relative, exports) => {
  const file = require.resolve(path.join(__dirname, relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub("../../../config/database", fakeDb);
stub("../../../config/firebase", {
  firebaseStatus: { enabled: true, projectId: "test" },
  legacyFirebaseStatus: { enabled: false },
  knownProjectIds: () => new Set(),
});

const { createRmAssignmentController } = require("../controller/rmAssignmentController");
const AudienceModel = require("../models/notificationAudienceModel");
const { checkAudiencePermission } = require("../utils/campaignRules");
const { processRecipient, recipientAuthority } = require("../../../services/Notifications/campaignWorker");
const rmNotificationController = require("../controller/rmNotificationController");

const ADMIN = { user_id: 7, role: "admin" };
const RM = { user_id: 18, role: "rm" };

function response() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function fakeModel(overrides = {}) {
  const calls = { assign: [], revoke: [], denied: [] };
  return {
    calls,
    async listRms() { return { rms: [], orphaned: [] }; },
    async listCompanies() { return []; },
    async assign(args) { calls.assign.push(args); return { assigned: args.companyIds, alreadyAssigned: [] }; },
    async revoke(args) { calls.revoke.push(args); return { removed: true }; },
    async auditDenied(entry) { calls.denied.push(entry); },
    async auditTrail() { return []; },
    ...overrides,
  };
}

/* ---------------- assignment API (controller) ---------------- */

test("only RMs pass the assignment guard; admins and every other role are rejected and audited", async () => {
  const model = fakeModel();
  const controller = createRmAssignmentController(model);
  let passed = false;
  await controller.requireAssignmentManager({ user: RM }, response(), () => { passed = true; });
  assert.equal(passed, true);
  assert.equal(model.calls.denied.length, 0);

  for (const user of [ADMIN, { user_id: 20, role: "hr" }, { user_id: 30, role: "vendor" }, { user_id: 31, role: "employee" }, { user_id: 32 }, undefined]) {
    let nextCalled = false;
    const res = response();
    await controller.requireAssignmentManager({ user, ip: "1.2.3.4", method: "POST", originalUrl: "/api/crm/v1/rm/assignments/18/companies?x=1" }, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false, String(user?.role));
    assert.equal(res.statusCode, 403, String(user?.role));
  }
  assert.equal(model.calls.denied.length, 6);
  assert.equal(model.calls.denied[0].actor.role, "admin");
  assert.equal(model.calls.denied[0].details.reason, "missing_manage_rm_company_assignments");
  assert.equal(model.calls.denied[0].details.path, "/api/crm/v1/rm/assignments/18/companies");
});

test("an RM can assign to itself and to another RM; the authenticated actor is recorded, not a body value", async () => {
  const model = fakeModel();
  const controller = createRmAssignmentController(model);
  for (const target of ["18", "21"]) {
    const res = response();
    await controller.assign({ user: RM, ip: "1.2.3.4", params: { rmUserId: target }, body: { company_ids: [1, 3, 3, 5], assigned_by: 7, role: "admin" } }, res);
    assert.equal(res.statusCode, 201);
  }
  assert.deepEqual(model.calls.assign.map((call) => [call.rmUserId, call.companyIds, call.actor]), [[18, [1, 3, 5], RM], [21, [1, 3, 5], RM]]);

  const res = response();
  await controller.revoke({ user: RM, params: { rmUserId: "21", companyId: "3" } }, res);
  assert.deepEqual(res.body.data, { rm_user_id: 21, company_id: 3, removed: true });
  assert.equal(model.calls.revoke[0].actor, RM);
});

test("an admin creates an assignment (201), and a repeat is reported as already assigned (200)", async () => {
  let assignedBefore = new Set();
  const model = fakeModel({
    async assign({ companyIds }) {
      const assigned = companyIds.filter((id) => !assignedBefore.has(id));
      const alreadyAssigned = companyIds.filter((id) => assignedBefore.has(id));
      assignedBefore = new Set([...assignedBefore, ...companyIds]);
      return { assigned, alreadyAssigned };
    },
  });
  const controller = createRmAssignmentController(model);
  const first = response();
  await controller.assign({ user: ADMIN, params: { rmUserId: "18" }, body: { company_ids: [5, 5, 7] } }, first);
  assert.equal(first.statusCode, 201);
  assert.deepEqual(first.body.data.assigned, [5, 7]);

  const again = response();
  await controller.assign({ user: ADMIN, params: { rmUserId: "18" }, body: { company_ids: [5] } }, again);
  assert.equal(again.statusCode, 200);
  assert.deepEqual(again.body.data.assigned, []);
  assert.deepEqual(again.body.data.already_assigned, [5]);
});

test("malformed RM or company ids are rejected before any database work", async () => {
  const model = fakeModel();
  const controller = createRmAssignmentController(model);
  for (const [params, body] of [
    [{ rmUserId: "abc" }, { company_ids: [1] }],
    [{ rmUserId: "18" }, { company_ids: [] }],
    [{ rmUserId: "18" }, { company_ids: ["1 OR 1=1"] }],
    [{ rmUserId: "18" }, { company_ids: [-3] }],
    [{ rmUserId: "18" }, { company_ids: "5" }],
    [{ rmUserId: "18" }, { company_ids: Array.from({ length: 101 }, (_, i) => i + 1) }],
  ]) {
    const res = response();
    await controller.assign({ user: ADMIN, params, body }, res);
    assert.equal(res.statusCode, 400, JSON.stringify({ params, body }));
  }
  assert.equal(model.calls.assign.length, 0);
});

test("invalid RM and ineligible companies return the model's error and are audited as denied", async () => {
  const errors = [
    { status: 404, message: "No RM account with this id." },
    { status: 422, message: "Unknown company id(s): 99.", missing: [99], inactive: [] },
    { status: 422, message: "Inactive company id(s) cannot be assigned: 11.", missing: [], inactive: [11] },
  ];
  for (const error of errors) {
    const model = fakeModel({ async assign() { return { error }; } });
    const res = response();
    await createRmAssignmentController(model).assign({ user: ADMIN, params: { rmUserId: "18" }, body: { company_ids: [99] } }, res);
    assert.equal(res.statusCode, error.status);
    assert.equal(res.body.message, error.message);
    assert.equal(model.calls.denied.length, 1);
  }
});

/* ---------------- company scope ---------------- */

test("an unassigned RM gets an empty scope and can only send tests", async () => {
  respond = (sql) => (/FROM rm_company_assignments/.test(sql) ? [[]] : [[]]);
  const scope = await AudienceModel.getScope(RM);
  assert.deepEqual(scope.companyIds, []);
  assert.equal(scope.global, false);
  assert.equal(AudienceModel.scopeFilter(scope).sql, "1 = 0");
  assert.equal(checkAudiencePermission("company", { company_ids: [5] }, scope).allowed, false);
  assert.equal(checkAudiencePermission("assigned_companies", {}, scope).allowed, false);
  assert.equal(checkAudiencePermission("test", {}, scope).allowed, true);
});

test("RM scope comes only from assignments to active companies", async () => {
  queries.length = 0;
  respond = (sql) => (/FROM rm_company_assignments/.test(sql) ? [[{ company_id: 5 }, { company_id: 7 }]] : [[]]);
  const scope = await AudienceModel.getScope(RM);
  assert.deepEqual(scope.companyIds, [5, 7]);
  const scopeQuery = queries.find((entry) => /rm_company_assignments/.test(entry.sql));
  assert.match(scopeQuery.sql, /JOIN companies co ON co.company_id = a.company_id AND co.status = 1/);
  assert.deepEqual(scopeQuery.params, [18]);
});

test("cross-company access is rejected however the request is shaped", () => {
  const scope = { role: "rm", global: false, companyIds: [5], assignmentsAvailable: true };
  // Explicitly selecting another company.
  assert.equal(checkAudiencePermission("company", { company_ids: [5, 9] }, scope).allowed, false);
  assert.equal(checkAudiencePermission("module_users", { company_ids: [9], module: "ecommerce" }, scope).allowed, false);
  assert.equal(checkAudiencePermission("all_companies", {}, scope).allowed, false);
  // Hand-picked employees of another company are filtered out by SQL scope.
  for (const type of ["individual", "selected", "module_users", "assigned_companies"]) {
    const where = AudienceModel.audienceWhere(type, { user_ids: [999], module: "ecommerce" }, scope);
    assert.match(where.sql, /c\.company_id IN \(\?\)/, type);
    assert.ok(where.params.includes(5), type);
  }
  // An admin-only audience can never be widened by an RM.
  assert.match(AudienceModel.audienceWhere("all_companies", {}, scope).sql, /1 = 0/);
});

/* ---------------- delivery-time revalidation (worker) ---------------- */

test("queued recipients outside the creator's current scope are skipped and audited", async () => {
  const audits = [];
  const claimed = [
    { recipient_id: 1, campaign_id: 10, user_id: 100 },
    { recipient_id: 2, campaign_id: 10, user_id: 200 },
  ];
  const campaigns = new Map([[10, { campaign_id: 10, created_by: 18 }]]);
  const blocked = await recipientAuthority(claimed, campaigns, {
    currentCreator: async () => RM,
    getScope: async () => ({ global: false, companyIds: [5] }), // company 9 was revoked
    companiesOf: async () => new Map([[100, 5], [200, 9]]),
    audit: async (entry) => audits.push(entry),
  });
  assert.deepEqual([...blocked], [[2, "out_of_scope"]]);
  assert.equal(audits.length, 1);
  assert.equal(audits[0].decision, "denied");
  assert.deepEqual(audits[0].details, { reason: "out_of_scope", recipients: 1 });
});

test("a creator who is not (or no longer) an RM is blocked for every queued recipient, admins included; a global RM sender is not filtered", async () => {
  const claimed = [{ recipient_id: 1, campaign_id: 10, user_id: 100 }];
  const campaigns = new Map([[10, { campaign_id: 10, created_by: 18 }]]);
  const demoted = await recipientAuthority(claimed, campaigns, {
    currentCreator: async () => ({ user_id: 18, role: "hr" }),
    getScope: async () => assert.fail("no scope lookup for a sender without authority"),
    companiesOf: async () => assert.fail("no company lookup"),
    audit: async () => {},
  });
  assert.deepEqual([...demoted], [[1, "sender_not_authorised"]]);

  // An older campaign created by an admin is not treated as RM-authorised.
  const audits = [];
  const admin = await recipientAuthority(claimed, campaigns, {
    currentCreator: async () => ADMIN,
    getScope: async () => assert.fail("no scope lookup for a sender without authority"),
    companiesOf: async () => assert.fail("no company lookup"),
    audit: async (entry) => { audits.push(entry); },
  });
  assert.deepEqual([...admin], [[1, "sender_not_authorised"]]);
  assert.equal(audits[0].details.reason, "sender_not_authorised");

  const globalRm = await recipientAuthority(claimed, campaigns, {
    currentCreator: async () => RM,
    getScope: async () => ({ global: true, companyIds: [] }),
    companiesOf: async () => assert.fail("global scope needs no company lookup"),
    audit: async () => assert.fail("nothing blocked"),
  });
  assert.equal(globalRm.size, 0);
});

test("a blocked recipient is never delivered", async () => {
  let delivered = 0;
  const update = await processRecipient(
    { recipient_id: 2, campaign_id: 10, user_id: 200, occurrence_no: 1, attempts: 0 },
    { campaign_id: 10, status: "sending", category: "transactional", title_en: "Hi", body_en: "There", approved_languages: "en" },
    null,
    new Date(),
    { blocked: "out_of_scope", deliver: async () => { delivered += 1; return { success: true, sent: 1 }; } },
  );
  assert.deepEqual(update, { status: "skipped", skip_reason: "out_of_scope" });
  assert.equal(delivered, 0);
});

/* ---------------- retry revalidates company access ---------------- */

test("retrying a campaign for a revoked company is denied and nothing is re-queued", async () => {
  queries.length = 0;
  respond = (sql) => {
    if (/FROM notification_campaigns nc/.test(sql)) {
      return [[{ campaign_id: 10, created_by: 18, status: "partially_failed", occurrences_started: 1, audience_type: "company", audience_filter: JSON.stringify({ company_ids: [9] }) }]];
    }
    if (/FROM rm_company_assignments/.test(sql)) return [[{ company_id: 5 }]];
    return [{ affectedRows: 0 }];
  };
  const res = response();
  await rmNotificationController.retryFailed({ user: RM, params: { id: "10" }, ip: "1.2.3.4" }, res);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /not assigned to you/);
  assert.ok(!queries.some((entry) => /UPDATE notification_campaign_recipients/.test(entry.sql)), "nothing re-queued");
  const audit = queries.find((entry) => /INSERT INTO notification_campaign_audit_logs/.test(entry.sql));
  assert.ok(audit, "denial audited");
  assert.equal(audit.params[3], "retry");
  assert.equal(audit.params[4], "denied");
});
