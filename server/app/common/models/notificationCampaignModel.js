const crypto = require("node:crypto");
const db = require("../../../config/database");
const { fromSqlUtc, toSqlUtc } = require("../utils/campaignSchedule");

// created_at/updated_at columns default to NOW(), i.e. the MySQL session
// timezone (IST on some servers). Scheduling columns are written in UTC
// explicitly. Display reads convert the NOW() columns so the API is all UTC.
const UTC = (column) => `CONVERT_TZ(${column}, @@session.time_zone, '+00:00')`;

const JSON_COLUMNS = ["variables", "audience_filter", "catalog_product_ids", "media"];
const DATE_COLUMNS = ["scheduled_at", "recurrence_end_at", "expires_at", "next_run_at", "submitted_at", "approved_at", "cancelled_at"];
const WRITABLE = [
  "name", "source", "template_id", "module", "category", "priority",
  "title_en", "body_en", "title_hi", "body_hi", "title_mr", "body_mr", "approved_languages",
  "variables", "target_screen", "reference_type", "reference_id", "image_url",
  "content_type", "destination_type", "destination_id", "catalog_product_ids", "media", "announcement_type",
  "audience_type", "audience_filter", "delivery_mode", "timezone", "scheduled_at",
  "recurrence_type", "recurrence_end_at", "max_occurrences", "expires_at", "estimated_recipients",
];

function parseJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function toRow(values) {
  const row = {};
  for (const key of WRITABLE) {
    if (!(key in values)) continue;
    const value = values[key];
    if (JSON_COLUMNS.includes(key)) row[key] = value == null ? null : JSON.stringify(value);
    else if (DATE_COLUMNS.includes(key)) row[key] = value instanceof Date ? toSqlUtc(value) : value || null;
    // mysql2 expands arrays into value lists (an empty one breaks the SQL);
    // list columns such as approved_languages are stored comma-separated.
    else if (Array.isArray(value)) row[key] = value.join(",");
    else row[key] = value === undefined ? null : value;
  }
  return row;
}

function hydrate(row) {
  if (!row) return null;
  const campaign = { ...row };
  campaign.variables = parseJson(row.variables, {});
  campaign.audience_filter = parseJson(row.audience_filter, {});
  campaign.catalog_product_ids = parseJson(row.catalog_product_ids, []) || [];
  campaign.media = parseJson(row.media, null);
  campaign.content_type = row.content_type || "standard";
  for (const key of DATE_COLUMNS) campaign[key] = fromSqlUtc(row[key]);
  delete campaign.lock_token;
  delete campaign.locked_until;
  return campaign;
}

// Delivery states are reported separately and never merged:
// queued -> inbox_created (row in notifications) -> firebase_accepted (FCM took
// it for >= 1 device) | inbox_only (no device) | failed; skipped = policy;
// opened comes from the app's tap events.
const RECIPIENT_COUNTS = `
  SELECT campaign_id,
    COUNT(*) AS recipients,
    SUM(status IN ('pending','processing')) AS queued,
    SUM(status = 'pending' AND attempts > 0) AS pending_retry,
    SUM(attempts > 0) AS attempted,
    SUM(notification_id IS NOT NULL) AS inbox_created,
    SUM(status = 'sent') AS sent,
    SUM(status = 'sent' AND devices_accepted > 0) AS firebase_accepted,
    SUM(status = 'inbox_only') AS inbox_only,
    SUM(status = 'failed') AS failed,
    SUM(status = 'skipped') AS skipped,
    SUM(status = 'cancelled') AS cancelled
  FROM notification_campaign_recipients
`;

class NotificationCampaignModel {
  async findByClientRequest(createdBy, clientRequestId) {
    const [[row]] = await db.query(
      "SELECT campaign_id FROM notification_campaigns WHERE created_by = ? AND client_request_id = ? LIMIT 1",
      [createdBy, clientRequestId],
    );
    return row?.campaign_id || null;
  }

  async create(values, actor, { clientRequestId = null } = {}) {
    const row = {
      ...toRow(values), created_by: actor.user_id, created_by_role: actor.role, updated_by: actor.user_id, status: "draft",
      ...(clientRequestId ? { client_request_id: clientRequestId } : {}),
    };
    const columns = Object.keys(row);
    const [result] = await db.query(
      `INSERT INTO notification_campaigns (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
      columns.map((column) => row[column]),
    );
    return result.insertId;
  }

  /** Content/audience update; only allowed while the caller holds the status. */
  async update(campaignId, values, actor, expectedStatuses) {
    const row = { ...toRow(values), updated_by: actor.user_id };
    const columns = Object.keys(row);
    const [result] = await db.query(
      `UPDATE notification_campaigns SET ${columns.map((column) => `${column} = ?`).join(", ")}
       WHERE campaign_id = ? AND status IN (${expectedStatuses.map(() => "?").join(",")})`,
      [...columns.map((column) => row[column]), campaignId, ...expectedStatuses],
    );
    return result.affectedRows === 1;
  }

  /** Compare-and-set status transition with extra column assignments. */
  async transition(campaignId, fromStatuses, toStatus, extra = {}) {
    const columns = Object.keys(extra);
    const [result] = await db.query(
      `UPDATE notification_campaigns
       SET status = ?${columns.map((column) => `, ${column} = ?`).join("")}
       WHERE campaign_id = ? AND status IN (${fromStatuses.map(() => "?").join(",")})`,
      [toStatus, ...columns.map((column) => (extra[column] instanceof Date ? toSqlUtc(extra[column]) : extra[column])), campaignId, ...fromStatuses],
    );
    return result.affectedRows === 1;
  }

  async findById(campaignId) {
    const [[row]] = await db.query(
      `SELECT nc.*, ${UTC("nc.created_at")} AS created_at, eu.name AS created_by_name, ap.name AS approved_by_name
       FROM notification_campaigns nc
       LEFT JOIN eusers eu ON eu.user_id = nc.created_by
       LEFT JOIN eusers ap ON ap.user_id = nc.approved_by
       WHERE nc.campaign_id = ?`,
      [campaignId],
    );
    return hydrate(row);
  }

  /** RMs see their own campaigns; admins see all. */
  visibilityFilter(actor) {
    return actor.role === "admin"
      ? { sql: "1 = 1", params: [] }
      : { sql: "nc.created_by = ?", params: [actor.user_id] };
  }

  async list(actor, { statuses = [], module = null, search = "", page = 1, limit = 20 } = {}) {
    const visible = this.visibilityFilter(actor);
    const where = [visible.sql];
    const params = [...visible.params];
    if (statuses.length) { where.push(`nc.status IN (${statuses.map(() => "?").join(",")})`); params.push(...statuses); }
    if (module) { where.push("nc.module = ?"); params.push(module); }
    if (search) { where.push("nc.name LIKE ?"); params.push(`%${search}%`); }

    const size = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * size;
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM notification_campaigns nc WHERE ${where.join(" AND ")}`, params);
    const [rows] = await db.query(
      `SELECT nc.*, ${UTC("nc.created_at")} AS created_at, eu.name AS created_by_name, rc.recipients, rc.queued, rc.pending_retry, rc.attempted,
              rc.sent, rc.firebase_accepted, rc.failed, rc.skipped, rc.cancelled AS recipients_cancelled
       FROM notification_campaigns nc
       LEFT JOIN eusers eu ON eu.user_id = nc.created_by
       LEFT JOIN (${RECIPIENT_COUNTS} GROUP BY campaign_id) rc ON rc.campaign_id = nc.campaign_id
       WHERE ${where.join(" AND ")}
       ORDER BY COALESCE(nc.next_run_at, nc.scheduled_at, nc.created_at) DESC, nc.campaign_id DESC
       LIMIT ? OFFSET ?`,
      [...params, size, offset],
    );
    return { total: Number(total), page: Math.max(Number(page) || 1, 1), limit: size, rows: rows.map(hydrate) };
  }

  async statusCounts(actor) {
    const visible = this.visibilityFilter(actor);
    const [rows] = await db.query(
      `SELECT status, COUNT(*) AS total FROM notification_campaigns nc WHERE ${visible.sql} GROUP BY status`,
      visible.params,
    );
    return Object.fromEntries(rows.map((row) => [row.status, Number(row.total)]));
  }

  async recipientSummary(campaignId) {
    const [[row]] = await db.query(`${RECIPIENT_COUNTS} WHERE campaign_id = ? GROUP BY campaign_id`, [campaignId]);
    let opened = null;
    try {
      const [[openRow]] = await db.query(
        `SELECT COUNT(*) AS total FROM notification_open_events oe
         JOIN notification_campaign_recipients r ON r.notification_id = oe.notification_id
         WHERE r.campaign_id = ?`,
        [campaignId],
      );
      opened = Number(openRow?.total || 0);
    } catch (error) {
      if (error.code !== "ER_NO_SUCH_TABLE") throw error;
    }
    const n = (value) => Number(value || 0);
    return {
      recipients: n(row?.recipients), queued: n(row?.queued), pendingRetry: n(row?.pending_retry),
      attempted: n(row?.attempted), inboxCreated: n(row?.inbox_created), sent: n(row?.sent),
      firebaseAccepted: n(row?.firebase_accepted), inboxOnly: n(row?.inbox_only),
      failed: n(row?.failed), skipped: n(row?.skipped), cancelled: n(row?.cancelled), opened,
    };
  }

  async listRecipients(campaignId, { status = null, page = 1, limit = 50 } = {}) {
    const where = ["r.campaign_id = ?"];
    const params = [campaignId];
    if (status) { where.push("r.status = ?"); params.push(status); }
    const size = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * size;
    const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM notification_campaign_recipients r WHERE ${where.join(" AND ")}`, params);
    const [rows] = await db.query(
      `SELECT r.recipient_id, r.occurrence_no, r.user_id, c.name, co.company_name, r.language, r.status,
              r.skip_reason, r.attempts, r.devices_attempted, r.devices_accepted, r.last_error_code,
              r.next_attempt_at, ${UTC("r.updated_at")} AS updated_at, n.is_read
       FROM notification_campaign_recipients r
       LEFT JOIN customer c ON c.user_id = r.user_id
       LEFT JOIN companies co ON co.company_id = c.company_id
       LEFT JOIN notifications n ON n.notification_id = r.notification_id
       WHERE ${where.join(" AND ")}
       ORDER BY r.recipient_id
       LIMIT ? OFFSET ?`,
      [...params, size, offset],
    );
    return { total: Number(total), rows };
  }

  /** Per-device FCM attempts; tokens are never selected. */
  async listAttempts(campaignId, { page = 1, limit = 50 } = {}) {
    const size = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * size;
    try {
      const [rows] = await db.query(
        `SELECT a.attempt_id, a.user_id, a.platform, a.firebase_project_id, a.attempt_no, a.status,
                a.error_code, ${UTC("a.created_at")} AS created_at, r.occurrence_no
         FROM notification_push_attempts a
         JOIN notification_campaign_recipients r ON r.notification_id = a.notification_id AND r.user_id = a.user_id
         WHERE r.campaign_id = ?
         ORDER BY a.attempt_id DESC
         LIMIT ? OFFSET ?`,
        [campaignId, size, offset],
      );
      return { available: true, rows };
    } catch (error) {
      if (error.code !== "ER_NO_SUCH_TABLE") throw error;
      return { available: false, rows: [] };
    }
  }

  async audit({ campaignId = null, actor, action, decision = "allowed", details = null, ip = null }) {
    try {
      await db.query(
        `INSERT INTO notification_campaign_audit_logs
         (campaign_id, actor_user_id, actor_role, action, decision, details, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [campaignId, actor.user_id, actor.role, action, decision, details ? JSON.stringify(details) : null, ip ? String(ip).slice(0, 64) : null],
      );
    } catch (error) {
      console.error("[Campaign Audit] Failed to record audit entry:", error.message);
    }
  }

  async auditTrail(campaignId) {
    const [rows] = await db.query(
      `SELECT a.audit_id, a.action, a.decision, a.details, ${UTC("a.created_at")} AS created_at, a.actor_role, eu.name AS actor_name
       FROM notification_campaign_audit_logs a
       LEFT JOIN eusers eu ON eu.user_id = a.actor_user_id
       WHERE a.campaign_id = ?
       ORDER BY a.audit_id DESC
       LIMIT 100`,
      [campaignId],
    );
    return rows.map((row) => ({ ...row, details: parseJson(row.details, null) }));
  }

  /* ---------------- worker queue ---------------- */

  /** Claim due campaigns; an expired lock means a previous worker died. */
  async claimDueCampaigns(limit = 5) {
    const token = crypto.randomUUID();
    await db.query(
      `UPDATE notification_campaigns
       SET lock_token = ?, locked_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE)
       WHERE status = 'scheduled' AND next_run_at <= UTC_TIMESTAMP()
         AND (locked_until IS NULL OR locked_until < UTC_TIMESTAMP())
       ORDER BY next_run_at
       LIMIT ?`,
      [token, limit],
    );
    const [rows] = await db.query("SELECT * FROM notification_campaigns WHERE lock_token = ? AND status = 'scheduled'", [token]);
    return rows.map((row) => ({ ...hydrate(row), lock_token: token }));
  }

  async insertRecipients(campaignId, occurrenceNo, recipients) {
    for (let index = 0; index < recipients.length; index += 500) {
      const chunk = recipients.slice(index, index + 500);
      // INSERT IGNORE + unique (campaign, occurrence, user): re-running a
      // half-finished materialisation after a crash adds no duplicates.
      await db.query(
        `INSERT IGNORE INTO notification_campaign_recipients
         (campaign_id, occurrence_no, user_id, language, status, next_attempt_at)
         VALUES ?`,
        [chunk.map((recipient) => [campaignId, occurrenceNo, recipient.user_id, recipient.language, "pending", toSqlUtc(new Date())])],
      );
    }
  }

  async markCampaignSending(campaign, { occurrenceNo, nextRunAt }) {
    const [result] = await db.query(
      `UPDATE notification_campaigns
       SET status = 'sending', occurrences_started = ?, next_run_at = ?, lock_token = NULL, locked_until = NULL
       WHERE campaign_id = ? AND lock_token = ? AND status = 'scheduled'`,
      [occurrenceNo, nextRunAt ? toSqlUtc(nextRunAt) : null, campaign.campaign_id, campaign.lock_token],
    );
    return result.affectedRows === 1;
  }

  async releaseCampaign(campaign, status, extra = {}) {
    const columns = Object.keys(extra);
    await db.query(
      `UPDATE notification_campaigns SET status = ?, lock_token = NULL, locked_until = NULL${columns.map((column) => `, ${column} = ?`).join("")}
       WHERE campaign_id = ? AND lock_token = ?`,
      [status, ...columns.map((column) => extra[column]), campaign.campaign_id, campaign.lock_token],
    );
  }

  /** Claim a batch of due recipients, including ones stuck by a dead worker. */
  async claimRecipients(limit = 100) {
    const token = crypto.randomUUID();
    await db.query(
      `UPDATE notification_campaign_recipients
       SET status = 'processing', lock_token = ?, locked_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE)
       WHERE (status = 'pending' AND (next_attempt_at IS NULL OR next_attempt_at <= UTC_TIMESTAMP()))
          OR (status = 'processing' AND locked_until < UTC_TIMESTAMP())
       ORDER BY recipient_id
       LIMIT ?`,
      [token, limit],
    );
    const [rows] = await db.query(
      `SELECT r.*, c.name AS customer_name
       FROM notification_campaign_recipients r
       LEFT JOIN customer c ON c.user_id = r.user_id
       WHERE r.lock_token = ?`,
      [token],
    );
    return rows;
  }

  async completeRecipient(recipientId, lockToken, update) {
    const columns = Object.keys(update);
    await db.query(
      `UPDATE notification_campaign_recipients
       SET ${columns.map((column) => `${column} = ?`).join(", ")}, lock_token = NULL, locked_until = NULL
       WHERE recipient_id = ? AND lock_token = ?`,
      [...columns.map((column) => (update[column] instanceof Date ? toSqlUtc(update[column]) : update[column])), recipientId, lockToken],
    );
  }

  /** Put retryable failures of the latest occurrence back in the queue. */
  async requeueFailedRecipients(campaignId, occurrenceNo, retryableCodes) {
    const [result] = await db.query(
      `UPDATE notification_campaign_recipients
       SET status = 'pending', attempts = 0, next_attempt_at = UTC_TIMESTAMP(), skip_reason = 'manual_retry',
           lock_token = NULL, locked_until = NULL
       WHERE campaign_id = ? AND occurrence_no = ? AND status = 'failed'
         AND last_error_code IN (${retryableCodes.map(() => "?").join(",")})`,
      [campaignId, occurrenceNo, ...retryableCodes],
    );
    return result.affectedRows;
  }

  async cancelPendingRecipients(campaignId) {
    const [result] = await db.query(
      `UPDATE notification_campaign_recipients SET status = 'cancelled', skip_reason = 'campaign_cancelled'
       WHERE campaign_id = ? AND status = 'pending'`,
      [campaignId],
    );
    return result.affectedRows;
  }

  async findCampaignsAwaitingCompletion() {
    const [rows] = await db.query(
      `SELECT nc.*, rc.queued, rc.sent, rc.failed, rc.skipped
       FROM notification_campaigns nc
       LEFT JOIN (
         SELECT campaign_id, occurrence_no,
           SUM(status IN ('pending','processing')) AS queued,
           SUM(status = 'sent') AS sent, SUM(status = 'inbox_only') AS inbox_only,
           SUM(status = 'failed') AS failed, SUM(status = 'skipped') AS skipped
         FROM notification_campaign_recipients GROUP BY campaign_id, occurrence_no
       ) rc ON rc.campaign_id = nc.campaign_id AND rc.occurrence_no = nc.occurrences_started
       WHERE nc.status = 'sending'`,
    );
    return rows.map((row) => ({
      ...hydrate(row),
      queued: Number(row.queued || 0), sent: Number(row.sent || 0), inboxOnly: Number(row.inbox_only || 0),
      failed: Number(row.failed || 0), skipped: Number(row.skipped || 0),
    }));
  }
}

module.exports = new NotificationCampaignModel();
module.exports.hydrate = hydrate;
