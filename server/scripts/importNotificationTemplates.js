/**
 * Reward Planners notification template catalog importer, v1.
 * Run from the server/ directory:
 *   node scripts/importNotificationTemplates.js --dry-run
 *   node scripts/importNotificationTemplates.js --apply
 *
 * Requires the notification_templates table (created manually; this script
 * never creates, alters or truncates it).
 * Never sends FCM messages, never changes existing notifications or tokens.
 * Existing template rows are preserved. All imported templates are disabled.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "../data/notification-templates-v1.json");
const apply = process.argv.includes("--apply");
const allowedArgs = new Set(["--apply", "--dry-run"]);
if (process.argv.slice(2).some((arg) => !allowedArgs.has(arg))) {
  console.error("Usage: node scripts/importNotificationTemplates.js [--dry-run|--apply]");
  process.exit(2);
}
if (process.argv.includes("--apply") && process.argv.includes("--dry-run")) {
  console.error("Choose only --apply or --dry-run");
  process.exit(2);
}

function asText(value, max, label, required = false) {
  if (value === null || value === undefined || value === "") {
    if (required) throw new Error(`${label} is required`);
    return null;
  }
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  if (max && value.length > max) throw new Error(`${label} exceeds ${max} characters`);
  return value;
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));
if (data.schema !== "rp-notifications-v1-draft" || !Array.isArray(data.templates)) {
  throw new Error("Unexpected template file schema");
}
if (data.template_count !== data.templates.length) {
  throw new Error(`Count mismatch: claimed ${data.template_count}, found ${data.templates.length}`);
}
const seen = new Set();
const rows = data.templates.map((t, i) => {
  const label = `template[${i}]`;
  const key = asText(t.template_key, 100, `${label}.template_key`, true);
  if (!/^[a-z0-9_]+$/.test(key)) throw new Error(`Invalid template_key: ${key}`);
  if (seen.has(key)) throw new Error(`Duplicate template_key: ${key}`);
  seen.add(key);
  if (!["transactional", "marketing", "engagement"].includes(t.notification_type)) {
    throw new Error(`Unexpected notification type for ${key}`);
  }
  if (t.enabled_by_default !== false) {
    throw new Error(`Import must default disabled; ${key} has enabled_by_default != false`);
  }
  return [
    key,
    asText(t.module, 40, `${key}.module`, true),
    asText(t.trigger, 0, `${key}.trigger`, true),
    asText(t.target_audience, 255, `${key}.target_audience`, true),
    t.notification_type,
    asText(t.priority, 20, `${key}.priority`, true),
    asText(t.title_en, 255, `${key}.title_en`, true),
    asText(t.body_en, 0, `${key}.body_en`, true),
    asText(t.title_mr, 255, `${key}.title_mr`),
    asText(t.body_mr, 0, `${key}.body_mr`),
    asText(t.title_hi, 255, `${key}.title_hi`),
    asText(t.body_hi, 0, `${key}.body_hi`),
    asText(t.deep_link_pattern, 512, `${key}.deep_link_pattern`),
    asText(t.source_status, 100, `${key}.source_status`, true),
    asText(t.localization_status, 80, `${key}.localization_status`),
    asText(t.notes, 0, `${key}.notes`),
    0,
  ];
});

const counts = rows.reduce((m, r) => {
  m[r[1]] = (m[r[1]] || 0) + 1;
  return m;
}, {});
console.log(`Validated ${rows.length} templates; all disabled by default.`);
console.log("Modules:", counts);

if (!apply) {
  console.log("DRY RUN: No MySQL changes. Use --apply after reviewing schema and backup.");
  process.exit(0);
}

// Lazy import: dry-run works without running the backend DB configuration.
const db = require("../config/database");
const sql = `
INSERT INTO notification_templates (
  template_key, module, trigger_description, target_audience, notification_type,
  priority, title_en, body_en, title_mr, body_mr, title_hi, body_hi,
  deep_link_pattern, source_status, localization_status, notes, is_enabled
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE template_key = template_key
`;

(async () => {
  let inserted = 0;
  for (const row of rows) {
    const [result] = await db.execute(sql, row);
    if (result.affectedRows === 1) inserted += 1;
  }
  const [[summary]] = await db.query(`
    SELECT COUNT(*) AS total, COALESCE(SUM(is_enabled = 1), 0) AS enabled
    FROM notification_templates
  `);
  console.log(`Inserted ${inserted} new templates (${rows.length - inserted} already existed and were left unchanged).`);
  console.log(`DB now has ${summary.total} rows, ${summary.enabled} enabled.`);
  console.log("No Firebase pushes were sent.");
})().catch(err => {
  console.error("IMPORT FAILED:", err.message);
  process.exitCode = 1;
}).finally(async () => {
  if (typeof db.end === "function") await db.end();
  process.exit();
});
