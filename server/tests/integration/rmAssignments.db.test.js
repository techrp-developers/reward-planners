// RM company assignments against a real, DISPOSABLE MariaDB database.
//
//   npm run test:rm-assignments:db
//
// Creates rp_test_rm_<random> on the configured server, copies only the
// STRUCTURE of the five tables involved (CREATE TABLE ... LIKE, no rows),
// seeds synthetic data and drops the database afterwards. It never writes to
// the application database and refuses to run if the names could collide.
// Firebase is stubbed; nothing is sent.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const SERVER = path.join(__dirname, "../..");
require("dotenv").config({ path: path.join(SERVER, ".env"), quiet: true });
const mysql = require("mysql2/promise");

// Opt-in only: the dedicated npm script, or RP_DISPOSABLE_DB_TESTS=1.
const ENABLED = process.env.RP_DISPOSABLE_DB_TESTS === "1" || process.env.npm_lifecycle_event === "test:rm-assignments:db";
const SOURCE_DB = process.env.DB_NAME || "rewardplanners_db";
const TEST_DB = `rp_test_rm_${crypto.randomBytes(4).toString("hex")}`;
// The audience queries also join preferences and device tokens (left empty).
// vendors, hr_account_approvals and company_users are read by the dashboard auth middleware.
const TABLES = ["eusers", "companies", "customer", "rm_company_assignments", "notification_campaign_audit_logs", "notification_preferences", "user_push_tokens", "vendors", "hr_account_approvals", "company_users", "notification_campaigns", "notification_campaign_recipients",
  "notification_templates", "notification_media", "notifications", "notification_push_attempts", "notification_open_events", "todo_reminders"];
const SAFE_NAME = /^rp_test_rm_[0-9a-f]{8}$/;

if (!ENABLED) {
  test("disposable-database RM assignment tests", { skip: "set RP_DISPOSABLE_DB_TESTS=1 (npm run test:rm-assignments:db)" }, () => {});
} else {
  let admin;
  let models;
  // Every FCM send() made by the code under test lands here; nothing leaves the machine.
  const fcmSends = [];

  test.before(async () => {
    assert.match(TEST_DB, SAFE_NAME);
    assert.notEqual(TEST_DB, SOURCE_DB);
    admin = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      multipleStatements: false,
    });
    await admin.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4`);
    for (const table of TABLES) {
      await admin.query(`CREATE TABLE \`${TEST_DB}\`.\`${table}\` LIKE \`${SOURCE_DB}\`.\`${table}\``);
    }
    await admin.query(`USE \`${TEST_DB}\``);
    await admin.query(
      `INSERT INTO eusers (user_id, name, email, role, is_verified) VALUES
       (7, 'Admin', 'admin@test.invalid', 'admin', 1),
       (18, 'RM One', 'rm1@test.invalid', 'rm', 1),
       (19, 'RM Unverified', 'rm2@test.invalid', 'rm', 0),
       (20, 'HR', 'hr@test.invalid', 'hr', 1),
       (21, 'RM Unassigned', 'rm3@test.invalid', 'rm', 1),
       (22, 'Vendor', 'vendor@test.invalid', 'vendor', 1)`,
    );
    await admin.query(
      `INSERT INTO companies (company_id, company_name, status) VALUES
       (5, 'Alpha', 1), (7, 'Beta', 1), (9, 'Gamma', 1), (11, 'Closed', 0)`,
    );
    // Links the HR login to an active company so it authenticates (and is then refused).
    await admin.query("UPDATE companies SET company_email = 'hr@test.invalid' WHERE company_id = 9");
    await admin.query(
      `INSERT INTO customer (user_id, name, password, company_id, status) VALUES
       (100, 'Emp Alpha', 'x', 5, 1), (200, 'Emp Gamma', 'x', 9, 1), (300, 'Emp Beta', 'x', 7, 1)`,
    );

    // Point the application pool at the disposable database before any model loads.
    process.env.DB_NAME = TEST_DB;
    const messagingFile = require.resolve("firebase-admin/messaging", { paths: [SERVER] });
    require.cache[messagingFile] = {
      id: messagingFile, filename: messagingFile, loaded: true,
      exports: { getMessaging: () => ({ send: async (message) => { fcmSends.push(message); return `projects/reward-planners-2324d/messages/test-${fcmSends.length}`; } }) },
    };
    const firebaseFile = require.resolve(path.join(SERVER, "config/firebase"));
    require.cache[firebaseFile] = {
      id: firebaseFile, filename: firebaseFile, loaded: true,
      exports: { firebaseStatus: { enabled: false }, legacyFirebaseStatus: { enabled: false }, knownProjectIds: () => new Set() },
    };
    models = {
      db: require(path.join(SERVER, "config/database")),
      assignments: require(path.join(SERVER, "app/common/models/rmAssignmentModel")),
      audience: require(path.join(SERVER, "app/common/models/notificationAudienceModel")),
      worker: require(path.join(SERVER, "services/Notifications/campaignWorker")),
      campaigns: require(path.join(SERVER, "app/common/models/notificationCampaignModel")),
    };
    const [[{ name }]] = await models.db.query("SELECT DATABASE() AS name");
    assert.equal(name, TEST_DB, "application pool must use the disposable database");
  });

  test.after(async () => {
    await models?.db.end().catch(() => {});
    if (admin) {
      if (SAFE_NAME.test(TEST_DB)) await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
      await admin.end();
    }
  });

  const ADMIN = { user_id: 7, role: "admin" };
  const RM = { user_id: 18, role: "rm" };
  const rows = async (sql, params = []) => (await admin.query(sql, params))[0];
  const audits = (action) => rows("SELECT * FROM notification_campaign_audit_logs WHERE action = ? ORDER BY audit_id", [action]);

  test("an admin assigns a company; the row and its audit entry are written together", async () => {
    const result = await models.assignments.assign({ rmUserId: 18, companyIds: [5], actor: ADMIN, ip: "127.0.0.1" });
    assert.deepEqual(result, { assigned: [5], alreadyAssigned: [] });
    const [row] = await rows("SELECT * FROM rm_company_assignments WHERE rm_user_id = 18 AND company_id = 5");
    assert.equal(row.assigned_by, 7);
    const granted = await audits("rm_assignment_granted");
    assert.equal(granted.length, 1);
    assert.equal(granted[0].campaign_id, null);
    assert.deepEqual(JSON.parse(granted[0].details), { rm_user_id: 18, company_id: 5 });
  });

  test("a duplicate assignment is not created and keeps its original assigner", async () => {
    const result = await models.assignments.assign({ rmUserId: 18, companyIds: [5], actor: { user_id: 70, role: "admin" } });
    assert.deepEqual(result, { assigned: [], alreadyAssigned: [5] });
    const all = await rows("SELECT * FROM rm_company_assignments WHERE rm_user_id = 18 AND company_id = 5");
    assert.equal(all.length, 1);
    assert.equal(all[0].assigned_by, 7);
    assert.equal((await audits("rm_assignment_granted")).length, 1);
  });

  test("concurrent identical assignments create exactly one row and one audit entry", async () => {
    await Promise.all([
      models.assignments.assign({ rmUserId: 21, companyIds: [7], actor: ADMIN }),
      models.assignments.assign({ rmUserId: 21, companyIds: [7], actor: ADMIN }),
    ]);
    assert.equal((await rows("SELECT * FROM rm_company_assignments WHERE rm_user_id = 21")).length, 1);
    const granted = (await audits("rm_assignment_granted")).filter((entry) => JSON.parse(entry.details).rm_user_id === 21);
    assert.equal(granted.length, 1);
    await models.assignments.revoke({ rmUserId: 21, companyId: 7, actor: ADMIN });
  });

  test("invalid or ineligible RMs are rejected and nothing is written", async () => {
    const before = (await rows("SELECT COUNT(*) n FROM rm_company_assignments"))[0].n;
    assert.equal((await models.assignments.assign({ rmUserId: 999, companyIds: [7], actor: ADMIN })).error.status, 404);
    assert.equal((await models.assignments.assign({ rmUserId: 20, companyIds: [7], actor: ADMIN })).error.status, 404, "HR is not an RM");
    assert.equal((await models.assignments.assign({ rmUserId: 7, companyIds: [7], actor: ADMIN })).error.status, 404, "admin is not an RM");
    assert.equal((await models.assignments.assign({ rmUserId: 19, companyIds: [7], actor: ADMIN })).error.status, 409, "unverified RM");
    assert.equal((await rows("SELECT COUNT(*) n FROM rm_company_assignments"))[0].n, before);
  });

  test("unknown or inactive companies are rejected all-or-nothing", async () => {
    const unknown = await models.assignments.assign({ rmUserId: 18, companyIds: [7, 999], actor: ADMIN });
    assert.equal(unknown.error.status, 422);
    assert.deepEqual(unknown.error.missing, [999]);
    const inactive = await models.assignments.assign({ rmUserId: 18, companyIds: [7, 11], actor: ADMIN });
    assert.equal(inactive.error.status, 422);
    assert.deepEqual(inactive.error.inactive, [11]);
    assert.equal((await rows("SELECT * FROM rm_company_assignments WHERE company_id IN (7, 11, 999) AND rm_user_id = 18")).length, 0);
  });

  test("an RM sees only assigned companies and their employees", async () => {
    const scope = await models.audience.getScope(RM);
    assert.deepEqual(scope.companyIds, [5]);
    assert.deepEqual((await models.audience.listCompanies(scope)).map((row) => row.company_id), [5]);
    assert.deepEqual((await models.audience.searchEmployees(scope)).map((row) => row.user_id), [100]);
    // Changing request parameters cannot reach another company.
    assert.deepEqual(await models.audience.searchEmployees(scope, { companyId: 9 }), []);
    assert.deepEqual(await models.audience.listRecipients("company", { company_ids: [9] }, scope), []);
    assert.equal((await models.audience.preview("selected", { user_ids: [200, 300] }, scope)).total, 0);
    assert.equal((await models.audience.preview("assigned_companies", {}, scope)).total, 1);
  });

  test("an unassigned RM has no audience", async () => {
    const scope = await models.audience.getScope({ user_id: 21, role: "rm" });
    assert.deepEqual(scope.companyIds, []);
    assert.equal((await models.audience.preview("assigned_companies", {}, scope)).total, 0);
    assert.equal((await models.audience.preview("selected", { user_ids: [100, 200, 300] }, scope)).total, 0);
  });

  test("queued recipients are re-checked against current assignments at delivery time", async () => {
    const claimed = [
      { recipient_id: 1, campaign_id: 42, user_id: 100 },
      { recipient_id: 2, campaign_id: 42, user_id: 200 },
    ];
    const blocked = await models.worker.recipientAuthority(claimed, new Map([[42, { campaign_id: 42, created_by: 18 }]]));
    assert.deepEqual([...blocked], [[2, "out_of_scope"]]);
    const [entry] = await rows("SELECT * FROM notification_campaign_audit_logs WHERE campaign_id = 42 AND action = 'send_blocked'");
    assert.equal(entry.decision, "denied");
  });

  test("worker queue: materialising twice adds no duplicate recipients", async () => {
    const recipients = [{ user_id: 100, language: "en" }, { user_id: 300, language: "en" }];
    await models.campaigns.insertRecipients(900, 1, recipients);
    await models.campaigns.insertRecipients(900, 1, recipients); // re-run after a crash mid-materialisation
    assert.equal((await rows("SELECT * FROM notification_campaign_recipients WHERE campaign_id = 900")).length, 2);
  });

  test("worker queue: concurrent claims never hand the same recipient to two workers", async () => {
    const [first, second] = await Promise.all([models.campaigns.claimRecipients(1), models.campaigns.claimRecipients(1)]);
    const ids = [...first, ...second].map((row) => row.recipient_id);
    assert.equal(ids.length, new Set(ids).size);
    assert.equal((await models.campaigns.claimRecipients(10)).filter((row) => row.campaign_id === 900).length, 2 - ids.length);
    assert.equal((await models.campaigns.claimRecipients(10)).filter((row) => row.campaign_id === 900).length, 0); // all locked
  });

  test("worker restart: rows locked by a crashed worker are reclaimed; its late write is ignored", async () => {
    const [{ recipient_id: id, lock_token: oldToken }] = await rows("SELECT recipient_id, lock_token FROM notification_campaign_recipients WHERE campaign_id = 900 ORDER BY recipient_id LIMIT 1");
    await admin.query("UPDATE notification_campaign_recipients SET locked_until = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE campaign_id = 900");
    const reclaimed = (await models.campaigns.claimRecipients(10)).filter((row) => row.campaign_id === 900);
    assert.equal(reclaimed.length, 2);
    await models.campaigns.completeRecipient(id, oldToken, { status: "sent" }); // the crashed worker wakes up
    assert.equal((await rows("SELECT status FROM notification_campaign_recipients WHERE recipient_id = ?", [id]))[0].status, "processing");
    const mine = reclaimed.find((row) => row.recipient_id === id);
    await models.campaigns.completeRecipient(id, mine.lock_token, { status: "skipped", skip_reason: "no_consent_record" });
    assert.equal((await rows("SELECT status FROM notification_campaign_recipients WHERE recipient_id = ?", [id]))[0].status, "skipped");
  });

  test("a due campaign is claimed by exactly one worker run", async () => {
    await admin.query(
      `INSERT INTO notification_campaigns (campaign_id, name, source, module, category, title_en, body_en, created_by, created_by_role, status, audience_type, next_run_at)
       VALUES (901, 'Due test', 'custom', 'common', 'marketing', 'T', 'B', 18, 'rm', 'scheduled', 'selected', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE))`,
    );
    const [a, b] = await Promise.all([models.campaigns.claimDueCampaigns(), models.campaigns.claimDueCampaigns()]);
    assert.equal([...a, ...b].filter((campaign) => campaign.campaign_id === 901).length, 1);
  });

  test("an expired, overdue campaign is closed as expired and never materialised, even with a consenting recipient", async () => {
    await admin.query("INSERT INTO notification_preferences (user_id, marketing_enabled, engagement_enabled) VALUES (100, 1, 1)");
    await admin.query(
      `INSERT INTO notification_campaigns (campaign_id, name, source, module, category, title_en, body_en, created_by, created_by_role, status, audience_type, audience_filter, next_run_at, expires_at)
       VALUES (903, 'Old Diwali', 'custom', 'common', 'marketing', 'T', 'B', 18, 'rm', 'scheduled', 'selected', '{"user_ids":[100]}',
               DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 HOUR), DATE_SUB(UTC_TIMESTAMP(), INTERVAL 119 MINUTE))`,
    );
    await models.worker.activateDueCampaigns();
    assert.equal((await rows("SELECT status FROM notification_campaigns WHERE campaign_id = 903"))[0].status, "expired");
    assert.equal((await rows("SELECT * FROM notification_campaign_recipients WHERE campaign_id = 903")).length, 0);
    assert.equal((await rows("SELECT * FROM notification_campaign_audit_logs WHERE campaign_id = 903 AND action = 'expired'")).length, 1);
    await admin.query("DELETE FROM notification_preferences WHERE user_id = 100");
  });

  test("delivery readiness separates candidates, consent exclusions and registered devices", async () => {
    const scope = await models.audience.getScope(RM);
    const filter = { user_ids: [100] };
    const before = await models.audience.deliveryReadiness("selected", filter, scope, "marketing", ["reward-planners-2324d"]);
    assert.deepEqual(before, { candidates: 1, withDevice: 0, consented: 0, noPreferenceRecord: 1, optedOut: 0, reachable: 0, unknownProjectDevices: 0 });
    await admin.query("INSERT INTO user_push_tokens (user_id, fcm_token, platform, is_active, firebase_project_id) VALUES (100, 'test-token-primary', 'android', 1, 'reward-planners-2324d')");
    const deviceOnly = await models.audience.deliveryReadiness("selected", filter, scope, "marketing", ["reward-planners-2324d"]);
    assert.equal(deviceOnly.withDevice, 1);
    assert.equal(deviceOnly.reachable, 0); // a device is not consent
    await admin.query("INSERT INTO notification_preferences (user_id, marketing_enabled, engagement_enabled) VALUES (100, 1, 0)");
    const consented = await models.audience.deliveryReadiness("selected", filter, scope, "marketing", ["reward-planners-2324d"]);
    assert.deepEqual([consented.consented, consented.reachable], [1, 1]);
    const engagement = await models.audience.deliveryReadiness("selected", filter, scope, "engagement", ["reward-planners-2324d"]);
    assert.deepEqual([engagement.consented, engagement.optedOut, engagement.reachable], [0, 1, 0]);
    const transactional = await models.audience.deliveryReadiness("selected", filter, scope, "transactional", ["reward-planners-2324d"]);
    assert.equal(transactional.reachable, 1); // no opt-in needed
    await admin.query("DELETE FROM user_push_tokens WHERE user_id = 100");
    await admin.query("DELETE FROM notification_preferences WHERE user_id = 100");
  });

  test("deactivating a company ends RM access to it", async () => {
    await models.assignments.assign({ rmUserId: 18, companyIds: [7], actor: ADMIN });
    assert.deepEqual((await models.audience.getScope(RM)).companyIds.sort(), [5, 7]);
    await admin.query("UPDATE companies SET status = 0 WHERE company_id = 7");
    assert.deepEqual((await models.audience.getScope(RM)).companyIds, [5]);
    await admin.query("UPDATE companies SET status = 1 WHERE company_id = 7");
  });

  test("revoking takes effect immediately and is audited; revoking again is a no-op", async () => {
    assert.deepEqual(await models.assignments.revoke({ rmUserId: 18, companyId: 5, actor: ADMIN, ip: "127.0.0.1" }), { removed: true });
    assert.deepEqual((await models.audience.getScope(RM)).companyIds, [7]);
    const claimed = [{ recipient_id: 3, campaign_id: 43, user_id: 100 }];
    const blocked = await models.worker.recipientAuthority(claimed, new Map([[43, { campaign_id: 43, created_by: 18 }]]));
    assert.equal(blocked.get(3), "out_of_scope");
    const revokedFor18 = async () => (await audits("rm_assignment_revoked")).filter((entry) => JSON.parse(entry.details).rm_user_id === 18);
    const [revoked] = await revokedFor18();
    assert.equal(JSON.parse(revoked.details).previously_assigned_by, 7);
    assert.deepEqual(await models.assignments.revoke({ rmUserId: 18, companyId: 5, actor: ADMIN }), { removed: false });
    assert.equal((await revokedFor18()).length, 1);
  });

  test("listing and the audit trail report assignments with assigner and time", async () => {
    const { rms, orphaned } = await models.assignments.listRms();
    // Only role 'rm' accounts, ordered by name; admins and HR are never listed.
    assert.deepEqual(rms.map((rm) => rm.user_id), [18, 21, 19]);
    assert.equal(rms.find((rm) => rm.user_id === 19).is_verified, false);
    const rm18 = rms.find((rm) => rm.user_id === 18);
    assert.deepEqual(rm18.companies.map((company) => [company.company_id, company.assigned_by, company.assigned_by_name]), [[7, 7, "Admin"]]);
    assert.ok(rm18.companies[0].created_at);
    assert.deepEqual(orphaned, []);
    const companies = await models.assignments.listCompanies();
    assert.equal(companies.find((company) => company.company_id === 11).eligible, false);
    assert.deepEqual(companies.find((company) => company.company_id === 7).rm_user_ids, [18]);
    const trail = await models.assignments.auditTrail({ rmUserId: 18 });
    assert.ok(trail.length >= 3);
    assert.ok(trail.every((entry) => entry.details.rm_user_id === 18));
  });

  /* ------- HTTP: real router, real dashboard auth, real JWT verification ------- */

  const jwt = require("jsonwebtoken");
  let baseUrl;
  let server;
  const tokenFor = (userId, options = {}) => jwt.sign({ user_id: userId, type: "access" }, process.env.JWT_SECRET, { expiresIn: "5m", ...options });
  const call = async (method, url, { token, body } = {}) => {
    const response = await fetch(`${baseUrl}${url}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  };

  let origin;
  const callAt = async (method, url, { token, body } = {}) => {
    const response = await fetch(`${origin}${url}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body && !["GET", "HEAD"].includes(method) ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  const notificationRouter = () => require(path.join(SERVER, "app/common/routes/rmNotificationRoute"));

  test("HTTP setup", async () => {
    assert.ok(process.env.JWT_SECRET, "JWT_SECRET must be configured to sign test tokens");
    const express = require("express");
    const app = express();
    app.use(express.json());
    // Both production prefixes, mounted exactly as in app.js / indexRoute.js.
    for (const prefix of ["/api/crm/v1", "/v1"]) {
      app.use(`${prefix}/rm/assignments`, require(path.join(SERVER, "app/common/routes/rmAssignmentRoute")));
      app.use(`${prefix}/rm/notifications`, notificationRouter());
    }
    await new Promise((resolve) => { server = app.listen(0, "127.0.0.1", resolve); });
    origin = `http://127.0.0.1:${server.address().port}`;
    baseUrl = `${origin}/api/crm/v1/rm/assignments`;
    await admin.query(
      `INSERT INTO notification_templates (template_id, template_key, module, trigger_description, target_audience, notification_type, priority, title_en, body_en, source_status, localization_status, is_enabled)
       VALUES (501, 'festive_offer', 'ecommerce', 'Catalog', 'Employees', 'marketing', 'normal', 'Festive offers', 'Up to 20% off', 'catalog', 'approved:', 0),
              (502, 'order_shipped', 'ecommerce', 'Order shipped', 'Buyer', 'transactional', 'high', 'Order shipped', 'On its way', 'catalog', 'approved:', 1)`,
    );
  });

  test.after(() => new Promise((resolve) => (server ? server.close(resolve) : resolve())));

  test("HTTP: an RM can list RMs, companies and the audit trail; an admin is refused", async () => {
    for (const url of ["/", "/companies", "/audit?rm_user_id=18"]) {
      const result = await call("GET", url, { token: tokenFor(18) });
      assert.equal(result.status, 200, url);
      assert.equal(result.body.success, true);
      assert.equal((await call("GET", url, { token: tokenFor(7) })).status, 403, `admin ${url}`);
    }
    assert.equal((await call("POST", "/18/companies", { token: tokenFor(7), body: { company_ids: [9] } })).status, 403);
    assert.equal((await call("DELETE", "/18/companies/9", { token: tokenFor(7) })).status, 403);
  });

  // Every route of both routers, read from the routers themselves so a new
  // endpoint cannot be forgotten here.
  const routesOf = (router) => router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) => Object.keys(layer.route.methods).map((method) => ({
      method: method.toUpperCase(),
      path: layer.route.path.replace(/:rmUserId/g, "18").replace(/:companyId/g, "9").replace(/:kind/g, "products").replace(/:id/g, "1"),
    })));

  test("HTTP RBAC: every Notification Manager and assignment route refuses admin, HR, vendor and unverified RMs (403) and anonymous or bad tokens (401), on both prefixes", async () => {
    const routes = [
      ...routesOf(notificationRouter()).map((route) => ({ ...route, base: "rm/notifications" })),
      ...routesOf(require(path.join(SERVER, "app/common/routes/rmAssignmentRoute"))).map((route) => ({ ...route, base: "rm/assignments" })),
    ];
    assert.ok(routes.length >= 35, `expected every route, got ${routes.length}`);
    for (const key of ["GET /campaigns/1/diagnostics", "POST /campaigns/1/send", "PUT /templates/1", "POST /campaigns/1/test", "GET /meta", "POST /18/companies"]) {
      assert.ok(routes.some((route) => `${route.method} ${route.path}` === key), key);
    }
    const forged = jwt.sign({ user_id: 18, type: "access" }, "not-the-secret");
    const deniedFor = async (userId) => Number((await rows(
      "SELECT COUNT(*) AS n FROM notification_campaign_audit_logs WHERE action = 'access_denied' AND actor_user_id = ?", [userId],
    ))[0].n);
    const before = await deniedFor(7);
    for (const prefix of ["/api/crm/v1", "/v1"]) {
      for (const route of routes) {
        const url = `${prefix}/${route.base}${route.path === "/" ? "" : route.path}`;
        for (const [who, userId] of [["admin", 7], ["hr", 20], ["vendor", 22], ["unverified rm", 19]]) {
          const result = await callAt(route.method, url, { token: tokenFor(userId), body: {} });
          assert.equal(result.status, 403, `${who} ${route.method} ${url}`);
        }
        assert.equal((await callAt(route.method, url, { body: {} })).status, 401, `anonymous ${route.method} ${url}`);
        assert.equal((await callAt(route.method, url, { token: forged, body: {} })).status, 401, `forged ${route.method} ${url}`);
      }
    }
    const notificationRoutes = routes.filter((route) => route.base === "rm/notifications").length;
    assert.equal(await deniedFor(7) - before, notificationRoutes * 2, "every admin refusal is audited");
    const [entry] = await rows("SELECT details FROM notification_campaign_audit_logs WHERE action = 'access_denied' AND actor_user_id = 7 LIMIT 1");
    assert.equal(JSON.parse(entry.details).reason, "push_notification_manager_rm_only");
  });

  test("HTTP RBAC: a role in the request body or query is never trusted", async () => {
    assert.equal((await callAt("GET", "/api/crm/v1/rm/notifications/meta?role=rm", { token: tokenFor(7) })).status, 403);
    const create = await callAt("POST", "/api/crm/v1/rm/notifications/campaigns", { token: tokenFor(7), body: { role: "rm", user_id: 18, name: "x" } });
    assert.equal(create.status, 403);
  });

  test("HTTP: the RM gets the full permission set from /meta", async () => {
    const result = await callAt("GET", "/api/crm/v1/rm/notifications/meta", { token: tokenFor(18) });
    assert.equal(result.status, 200);
    const permissions = result.body.data.permissions;
    for (const key of ["manageCampaigns", "sendNotifications", "scheduleNotifications", "manageTemplates", "manageCompanyAssignments",
      "manageAudiences", "viewHistory", "viewAnalytics", "viewDeliveryDiagnostics", "manageNotificationModuleSettings", "send"]) {
      assert.equal(permissions[key], true, key);
    }
    assert.equal(permissions.sendAllCompanies, false); // no global-sender shortcut
    assert.doesNotMatch(JSON.stringify(result.body), /private_key|BEGIN PRIVATE|access_token/);
  });

  test("HTTP: an RM creates, schedules and cancels a campaign within its own companies; admins and other RMs are refused", async () => {
    // RM 18 already holds company 7 (employee 300); nothing is assigned here.
    const rm = tokenFor(18);
    const companies = await callAt("GET", "/api/crm/v1/rm/notifications/audience/companies", { token: rm });
    assert.equal(companies.status, 200);
    const assigned = new Set((await rows("SELECT company_id FROM rm_company_assignments WHERE rm_user_id = 18")).map((row) => Number(row.company_id)));
    assert.ok(companies.body.data.length > 0);
    assert.ok(companies.body.data.every((company) => assigned.has(Number(company.company_id))), "only assigned companies");

    const created = await callAt("POST", "/api/crm/v1/rm/notifications/campaigns", {
      token: rm,
      body: { name: "RBAC test", module: "common", category: "marketing", title_en: "Hello", body_en: "World", audience_type: "selected", audience_filter: { user_ids: [300] } },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.campaign_id;
    assert.equal((await callAt("POST", "/api/crm/v1/rm/notifications/campaigns", { token: tokenFor(7), body: { name: "x" } })).status, 403);

    const scheduled = await callAt("POST", `/api/crm/v1/rm/notifications/campaigns/${id}/send`, {
      token: rm, body: { mode: "schedule", send_date: "2030-01-15", send_time: "10:00", timezone: "Asia/Kolkata" },
    });
    assert.equal(scheduled.status, 200, JSON.stringify(scheduled.body));
    assert.equal(scheduled.body.data.status, "scheduled");
    assert.ok(scheduled.body.warning, "a schedule that cannot run here (no worker, no consent) says so");
    const [row] = await rows(`SELECT DATE_FORMAT(next_run_at, '%Y-%m-%d %H:%i') AS at FROM notification_campaigns WHERE campaign_id = ?`, [id]);
    assert.equal(row.at, "2030-01-15 04:30"); // 10:00 IST stored as UTC
    assert.equal((await callAt("POST", `/api/crm/v1/rm/notifications/campaigns/${id}/send`, { token: tokenFor(7), body: { mode: "schedule" } })).status, 403);

    // Send test stays limited to the NOTIFICATION_TEST_USER_IDS allow-list.
    const saved = process.env.NOTIFICATION_TEST_USER_IDS;
    process.env.NOTIFICATION_TEST_USER_IDS = "";
    try {
      assert.equal((await callAt("POST", `/api/crm/v1/rm/notifications/campaigns/${id}/test`, { token: rm, body: { user_ids: [100, 200] } })).status, 400);
    } finally {
      if (saved === undefined) delete process.env.NOTIFICATION_TEST_USER_IDS; else process.env.NOTIFICATION_TEST_USER_IDS = saved;
    }

    for (const url of ["/history", "/analytics", "/overview", "/campaigns", `/campaigns/${id}`, `/campaigns/${id}/diagnostics`, `/campaigns/${id}/recipients`]) {
      assert.equal((await callAt("GET", `/api/crm/v1/rm/notifications${url}`, { token: rm })).status, 200, url);
    }
    // Another RM can neither see nor cancel it.
    assert.equal((await callAt("GET", `/api/crm/v1/rm/notifications/campaigns/${id}`, { token: tokenFor(21) })).status, 404);
    assert.equal((await callAt("POST", `/api/crm/v1/rm/notifications/campaigns/${id}/cancel`, { token: tokenFor(21) })).status, 404);

    const cancelled = await callAt("POST", `/api/crm/v1/rm/notifications/campaigns/${id}/cancel`, { token: rm });
    assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));
    assert.equal(cancelled.body.data.status, "cancelled");
  });

  test("HTTP: an RM enables and disables promotional templates; system-event templates stay read-only; admins are refused", async () => {
    const rm = tokenFor(18);
    const enabled = async (id) => Number((await rows("SELECT is_enabled FROM notification_templates WHERE template_id = ?", [id]))[0].is_enabled);
    const enable = await callAt("PUT", "/api/crm/v1/rm/notifications/templates/501", { token: rm, body: { is_enabled: true } });
    assert.equal(enable.status, 200, JSON.stringify(enable.body));
    assert.equal(await enabled(501), 1);
    assert.equal((await callAt("PUT", "/api/crm/v1/rm/notifications/templates/501", { token: rm, body: { is_enabled: false } })).status, 200);
    assert.equal(await enabled(501), 0);

    const system = await callAt("PUT", "/api/crm/v1/rm/notifications/templates/502", { token: rm, body: { is_enabled: false } });
    assert.equal(system.status, 403);
    assert.match(system.body.message, /System event/);
    assert.equal(await enabled(502), 1);
    const transactional = await callAt("POST", "/api/crm/v1/rm/notifications/templates", {
      token: rm, body: { template_key: "fake_order_event", module: "common", notification_type: "transactional", title_en: "T", body_en: "B" },
    });
    assert.equal(transactional.status, 400);

    assert.equal((await callAt("PUT", "/api/crm/v1/rm/notifications/templates/501", { token: tokenFor(7), body: { is_enabled: true } })).status, 403);
    assert.equal(await enabled(501), 0);
  });

  test("HTTP: an RM assigns to itself and to another verified RM; the actor is the token's user", async () => {
    const self = await call("POST", "/18/companies", { token: tokenFor(18), body: { company_ids: [9, 9], assigned_by: 7 } });
    assert.equal(self.status, 201);
    assert.deepEqual(self.body.data, { rm_user_id: 18, assigned: [9], already_assigned: [] });
    const other = await call("POST", "/21/companies", { token: tokenFor(18), body: { company_ids: [5] } });
    assert.equal(other.status, 201);
    const repeat = await call("POST", "/21/companies", { token: tokenFor(18), body: { company_ids: [5] } });
    assert.equal(repeat.status, 200);
    assert.deepEqual(repeat.body.data.already_assigned, [5]);
    assert.equal((await rows("SELECT * FROM rm_company_assignments WHERE rm_user_id = 21 AND company_id = 5")).length, 1);

    const [row] = await rows("SELECT assigned_by FROM rm_company_assignments WHERE rm_user_id = 18 AND company_id = 9");
    assert.equal(row.assigned_by, 18);
    const granted = (await audits("rm_assignment_granted")).filter((entry) => JSON.parse(entry.details).company_id === 9);
    assert.deepEqual(granted.map((entry) => [entry.actor_user_id, entry.actor_role]), [[18, "rm"]]);
    assert.deepEqual((await models.audience.getScope(RM)).companyIds.sort(), [7, 9]);
  });

  test("HTTP: an RM revokes; scope shrinks immediately and the revocation names the RM", async () => {
    const result = await call("DELETE", "/21/companies/5", { token: tokenFor(18) });
    assert.equal(result.status, 200);
    assert.equal(result.body.data.removed, true);
    assert.deepEqual((await models.audience.getScope({ user_id: 21, role: "rm" })).companyIds, []);
    const [revoked] = (await audits("rm_assignment_revoked")).filter((entry) => JSON.parse(entry.details).rm_user_id === 21 && JSON.parse(entry.details).company_id === 5);
    assert.deepEqual([revoked.actor_user_id, revoked.actor_role], [18, "rm"]);
    assert.equal((await call("DELETE", "/21/companies/5", { token: tokenFor(18) })).body.data.removed, false);
  });

  test("HTTP: invalid targets and companies are refused for RMs too", async () => {
    assert.equal((await call("POST", "/19/companies", { token: tokenFor(18), body: { company_ids: [5] } })).status, 409, "unverified target RM");
    assert.equal((await call("POST", "/20/companies", { token: tokenFor(18), body: { company_ids: [5] } })).status, 404, "HR is not an RM");
    assert.equal((await call("POST", "/18/companies", { token: tokenFor(18), body: { company_ids: [11] } })).status, 422, "inactive company");
    assert.equal((await call("POST", "/18/companies", { token: tokenFor(18), body: { company_ids: [999] } })).status, 422, "unknown company");
    assert.equal((await call("POST", "/18/companies", { token: tokenFor(18), body: { company_ids: ["1 OR 1=1"] } })).status, 400, "non-integer id");
  });

  test("HTTP: HR, vendor and unverified RM accounts cannot read or change assignments", async () => {
    const before = (await rows("SELECT COUNT(*) n FROM rm_company_assignments"))[0].n;
    for (const userId of [20, 22]) {
      assert.equal((await call("GET", "/", { token: tokenFor(userId) })).status, 403, `${userId} list`);
      assert.equal((await call("POST", "/18/companies", { token: tokenFor(userId), body: { company_ids: [5] } })).status, 403, `${userId} assign`);
      assert.equal((await call("DELETE", "/18/companies/9", { token: tokenFor(userId) })).status, 403, `${userId} revoke`);
    }
    const unverified = await call("POST", "/19/companies", { token: tokenFor(19), body: { company_ids: [5] } });
    assert.equal(unverified.status, 403);
    assert.equal(unverified.body.message, "Account not verified");
    assert.equal((await rows("SELECT COUNT(*) n FROM rm_company_assignments"))[0].n, before);
    const denied = await audits("rm_assignment_denied");
    assert.ok(denied.some((entry) => entry.actor_user_id === 20 && entry.actor_role === "hr"));
    assert.ok(denied.some((entry) => entry.actor_user_id === 22 && entry.actor_role === "vendor"));
  });

  let waServer;
  test.after(() => new Promise((resolve) => (waServer ? waServer.close(resolve) : resolve())));

  // Developer tools router (/api/wa), mounted on its own app with the
  // side-effect modules stubbed: nothing can really be sent from here.
  let waOrigin;
  const waCall = async (method, url, { token, body } = {}) => {
    const response = await fetch(`${waOrigin}/api/wa${url}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body && !["GET", "HEAD"].includes(method) ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  const notificationRows = async (userId) => Number((await rows("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?", [userId]))[0].n);

  test("WA dev tools setup", async () => {
    const express = require("express");
    const sideEffects = { sends: 0 };
    const stubModule = (relative, exports) => {
      const file = require.resolve(path.join(SERVER, relative));
      require.cache[file] = { id: file, filename: file, loaded: true, exports };
    };
    stubModule("services/Todo/birthdayReminderCron", { sendBirthdayWishes: async () => { sideEffects.sends += 1; } });
    stubModule("services/whatsapp/waEnqueueService", { enqueueWhatsApp: async () => { sideEffects.sends += 1; return {}; } });
    const app = express();
    app.use(express.json());
    app.use("/api/wa", require(path.join(SERVER, "routes/waTestRoute")));
    await new Promise((resolve) => { waServer = app.listen(0, "127.0.0.1", resolve); });
    waOrigin = `http://127.0.0.1:${waServer.address().port}`;
    process.env.NOTIFICATION_TEST_USER_IDS = "100";
    await admin.query("INSERT INTO user_push_tokens (user_id, fcm_token, platform, is_active, firebase_project_id) VALUES (100, 'secret-test-token-abcdefghijklmnopqrstuvwxyz', 'android', 1, 'reward-planners-2324d')");
  });

  test("WA dev tools: anonymous, forged and expired tokens get 401; admin, HR, vendor and unverified RM get 403; nothing is sent", async () => {
    const before = await notificationRows(100);
    const forged = jwt.sign({ user_id: 18, type: "access" }, "attacker-secret");
    const expired = tokenFor(18, { expiresIn: -60 });
    const routes = [
      ["GET", "/notification-health/100?sendTest=true"], ["GET", "/notification-health/100"], ["POST", "/test-push/100"],
      ["POST", "/test-all/100"], ["POST", "/test-single/100/todo_15min"], ["POST", "/notification-trigger/100"],
      ["POST", "/test-birthday"], ["POST", "/test"], ["GET", "/notification-types"],
    ];
    for (const [method, url] of routes) {
      assert.equal((await waCall(method, url)).status, 401, `anonymous ${method} ${url}`);
      assert.equal((await waCall(method, url, { token: forged })).status, 401, `forged ${method} ${url}`);
      assert.equal((await waCall(method, url, { token: expired })).status, 401, `expired ${method} ${url}`);
      for (const [who, userId] of [["admin", 7], ["hr", 20], ["vendor", 22], ["unverified rm", 19]]) {
        assert.equal((await waCall(method, url, { token: tokenFor(userId) })).status, 403, `${who} ${method} ${url}`);
      }
    }
    assert.equal(await notificationRows(100), before);
  });

  test("WA dev tools: the health check is read-only and never returns the device token", async () => {
    const rm = tokenFor(18);
    const before = await notificationRows(100);
    const send = await waCall("GET", "/notification-health/100?sendTest=true", { token: rm });
    assert.equal(send.status, 400);
    assert.equal(send.body.code, "SEND_NOT_ALLOWED_ON_GET");
    const health = await waCall("GET", "/notification-health/100", { token: rm });
    assert.equal(health.status, 200);
    assert.equal(health.body.testPushResult, undefined);
    assert.doesNotMatch(JSON.stringify(health.body), /secret-test-token/);
    assert.equal(await notificationRows(100), before);
    // The old GET side-effect URLs no longer exist.
    assert.equal((await waCall("GET", "/test-all/100", { token: rm })).status, 404);
    assert.equal((await waCall("GET", "/test-birthday", { token: rm })).status, 404);
  });

  test("WA dev tools: an RM can only target allow-listed test employees", async () => {
    const rm = tokenFor(18);
    for (const [method, url] of [["GET", "/notification-health/200"], ["POST", "/test-push/200"], ["POST", "/test-all/200"], ["POST", "/notification-trigger/300"]]) {
      const result = await waCall(method, url, { token: rm });
      assert.equal(result.status, 403, `${method} ${url}`);
      assert.equal(result.body.code, "NOT_A_TEST_USER");
    }
    assert.equal(await notificationRows(200), 0);
    assert.equal(await notificationRows(300), 0);
  });

  test("WA dev tools: test-push is development-only and needs Firebase; refusals are audited and send nothing", async () => {
    const savedEnv = process.env.NODE_ENV;
    const before = await notificationRows(100);
    try {
      process.env.NODE_ENV = "staging";
      const staging = await waCall("POST", "/test-push/100", { token: tokenFor(18) });
      assert.equal(staging.status, 403);
      assert.equal(staging.body.code, "DEVELOPMENT_ONLY");
    } finally {
      process.env.NODE_ENV = savedEnv;
    }
    process.env.NODE_ENV = "development";
    try {
      // Firebase is stubbed as disabled in this suite: refused before any inbox row or send.
      const result = await waCall("POST", "/test-push/100", { token: tokenFor(21) });
      assert.equal(result.status, 503);
      assert.equal(result.body.code, "FIREBASE_UNAVAILABLE");
      assert.doesNotMatch(JSON.stringify(result.body), /secret-test-token/);
      // 1 per minute per RM.
      assert.equal((await waCall("POST", "/test-push/100", { token: tokenFor(21) })).status, 429);
    } finally {
      process.env.NODE_ENV = savedEnv;
    }
    assert.equal(await notificationRows(100), before);
    const audits = await rows("SELECT decision, details FROM notification_campaign_audit_logs WHERE action = 'test_push' ORDER BY audit_id");
    assert.deepEqual(audits.map((entry) => [entry.decision, JSON.parse(entry.details).reason]), [["denied", "not_development"], ["denied", "FIREBASE_UNAVAILABLE"]]);
    await admin.query("DELETE FROM user_push_tokens WHERE user_id = 100");
  });

  test("Dashboard Send test: one allow-listed employee, one chosen device, one FCM send; campaign status unchanged", async () => {
    const firebase = require(path.join(SERVER, "config/firebase")).firebaseStatus;
    const saved = { enabled: firebase.enabled, projectId: firebase.projectId, users: process.env.NOTIFICATION_TEST_USER_IDS };
    Object.assign(firebase, { enabled: true, projectId: "reward-planners-2324d" });
    process.env.NOTIFICATION_TEST_USER_IDS = "300";
    const [{ insertId: phoneA }] = await admin.query("INSERT INTO user_push_tokens (user_id, fcm_token, platform, is_active, firebase_project_id) VALUES (300, 'token-phone-a-abcdefghijklmnopqrstuvwxyz', 'android', 1, 'reward-planners-2324d')");
    const [{ insertId: phoneB }] = await admin.query("INSERT INTO user_push_tokens (user_id, fcm_token, platform, is_active, firebase_project_id) VALUES (300, 'token-phone-b-abcdefghijklmnopqrstuvwxyz', 'android', 1, 'reward-planners-2324d')");
    await admin.query("INSERT INTO user_push_tokens (user_id, fcm_token, platform, is_active, firebase_project_id) VALUES (300, 'token-old-build-abcdefghijklmnopqrstuvw', 'android', 1, NULL)");
    try {
      const rm = tokenFor(18);
      const created = await callAt("POST", "/api/crm/v1/rm/notifications/campaigns", {
        token: rm, body: { name: "Dashboard test", module: "common", category: "marketing", title_en: "Hello", body_en: "World", audience_type: "selected", audience_filter: { user_ids: [300] } },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.data.campaign_id;

      // The picker: masked tokens only, primary-project devices only.
      const devices = await callAt("GET", "/api/crm/v1/rm/notifications/test-devices", { token: rm });
      assert.equal(devices.status, 200);
      assert.deepEqual(devices.body.data.map((user) => [user.user_id, user.devices.map((device) => device.device_id).sort()]), [[300, [phoneA, phoneB].sort()]]);
      assert.doesNotMatch(JSON.stringify(devices.body), /token-phone|token-old/);

      // Two devices and none chosen: refused, nothing sent.
      const ambiguous = await callAt("POST", `/api/crm/v1/rm/notifications/campaigns/${id}/test`, { token: rm, body: { user_id: 300 } });
      assert.equal(ambiguous.status, 409);
      assert.match(ambiguous.body.message, /Choose the device/);
      // Not a test employee, or another employee's device: refused.
      assert.equal((await callAt("POST", `/api/crm/v1/rm/notifications/campaigns/${id}/test`, { token: rm, body: { user_id: 100, device_id: phoneA } })).status, 403);
      assert.equal((await callAt("POST", `/api/crm/v1/rm/notifications/campaigns/${id}/test`, { token: rm, body: { user_id: 300, device_id: 999999 } })).status, 404);
      assert.equal(fcmSends.length, 0);

      const sent = await callAt("POST", `/api/crm/v1/rm/notifications/campaigns/${id}/test`, { token: rm, body: { user_id: 300, device_id: phoneB } });
      assert.equal(sent.status, 200, JSON.stringify(sent.body));
      assert.equal(fcmSends.length, 1, "exactly one FCM send");
      assert.equal(fcmSends[0].token, "token-phone-b-abcdefghijklmnopqrstuvwxyz");
      assert.match(fcmSends[0].notification.title, /^\[TEST\] Hello/);
      assert.equal(fcmSends[0].android.notification.channelId, "reward_planners_offers"); // marketing category
      const [result] = sent.body.data;
      assert.equal(result.firebase_accepted, 1);
      assert.equal(result.device.id, phoneB);
      assert.doesNotMatch(JSON.stringify(sent.body), /token-phone/);

      const [campaign] = await rows("SELECT status, occurrences_started FROM notification_campaigns WHERE campaign_id = ?", [id]);
      assert.deepEqual([campaign.status, Number(campaign.occurrences_started)], ["draft", 0]);
      assert.equal((await rows("SELECT * FROM notification_campaign_recipients WHERE campaign_id = ?", [id])).length, 0);
      const [attempt] = await rows("SELECT push_token_id, status, attempt_no FROM notification_push_attempts ORDER BY attempt_id DESC LIMIT 1");
      assert.deepEqual([Number(attempt.push_token_id), attempt.status, Number(attempt.attempt_no)], [phoneB, "accepted", 1]);
      const audit = await rows("SELECT decision, details FROM notification_campaign_audit_logs WHERE campaign_id = ? AND action = 'test_sent' ORDER BY audit_id", [id]);
      assert.deepEqual(audit.map((entry) => entry.decision), ["denied", "denied", "allowed"]);
      assert.equal(JSON.parse(audit.at(-1).details).device_id, phoneB);
    } finally {
      Object.assign(firebase, { enabled: saved.enabled, projectId: saved.projectId });
      if (saved.users === undefined) delete process.env.NOTIFICATION_TEST_USER_IDS; else process.env.NOTIFICATION_TEST_USER_IDS = saved.users;
      await admin.query("DELETE FROM user_push_tokens WHERE user_id = 300");
    }
  });

  test("Dashboard Send now is refused with the real reason while no campaign worker runs here", async () => {
    const firebase = require(path.join(SERVER, "config/firebase")).firebaseStatus;
    const saved = { enabled: firebase.enabled, projectId: firebase.projectId };
    Object.assign(firebase, { enabled: true, projectId: "reward-planners-2324d" });
    try {
      const rm = tokenFor(18);
      const created = await callAt("POST", "/api/crm/v1/rm/notifications/campaigns", {
        token: rm, body: { name: "Now test", module: "common", category: "announcement", announcement_type: "company_update", title_en: "Hi", body_en: "There", audience_type: "selected", audience_filter: { user_ids: [300] } },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const now = await callAt("POST", `/api/crm/v1/rm/notifications/campaigns/${created.body.data.campaign_id}/send`, { token: rm, body: { mode: "now" } });
      assert.equal(now.status, 409);
      assert.equal(now.body.code, "SCHEDULER_DISABLED");
      assert.match(now.body.message, /campaign worker is not running/);
      const [campaign] = await rows("SELECT status FROM notification_campaigns WHERE campaign_id = ?", [created.body.data.campaign_id]);
      assert.equal(campaign.status, "draft"); // not queued, so never "Scheduled / queued" by mistake
    } finally {
      Object.assign(firebase, saved);
    }
  });

  test("HTTP: the JWT signature is mandatory (forged, unsigned, expired or missing tokens never reach the guard)", async () => {
    const forged = jwt.sign({ user_id: 7, type: "access" }, "attacker-secret");
    const unsigned = jwt.sign({ user_id: 7, type: "access" }, null, { algorithm: "none" });
    const expired = tokenFor(7, { expiresIn: -60 });
    const refresh = jwt.sign({ user_id: 7, type: "refresh" }, process.env.JWT_SECRET);
    for (const [name, token] of Object.entries({ forged, unsigned, expired, refresh })) {
      const result = await call("POST", "/18/companies", { token, body: { company_ids: [5] } });
      assert.equal(result.status, 401, name);
    }
    assert.equal((await call("GET", "/")).status, 401, "no token");
    assert.equal((await rows("SELECT * FROM rm_company_assignments WHERE rm_user_id = 18 AND company_id = 5")).length, 0);
  });
}
