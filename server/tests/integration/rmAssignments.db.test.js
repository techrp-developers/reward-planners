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
const TABLES = ["eusers", "companies", "customer", "rm_company_assignments", "notification_campaign_audit_logs", "notification_preferences", "user_push_tokens"];
const SAFE_NAME = /^rp_test_rm_[0-9a-f]{8}$/;

if (!ENABLED) {
  test("disposable-database RM assignment tests", { skip: "set RP_DISPOSABLE_DB_TESTS=1 (npm run test:rm-assignments:db)" }, () => {});
} else {
  let admin;
  let models;

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
       (21, 'RM Unassigned', 'rm3@test.invalid', 'rm', 1)`,
    );
    await admin.query(
      `INSERT INTO companies (company_id, company_name, status) VALUES
       (5, 'Alpha', 1), (7, 'Beta', 1), (9, 'Gamma', 1), (11, 'Closed', 0)`,
    );
    await admin.query(
      `INSERT INTO customer (user_id, name, password, company_id, status) VALUES
       (100, 'Emp Alpha', 'x', 5, 1), (200, 'Emp Gamma', 'x', 9, 1), (300, 'Emp Beta', 'x', 7, 1)`,
    );

    // Point the application pool at the disposable database before any model loads.
    process.env.DB_NAME = TEST_DB;
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
}
