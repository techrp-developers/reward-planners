const db = require("../../../config/database");
const CampaignModel = require("../models/notificationCampaignModel");
const AudienceModel = require("../models/notificationAudienceModel");
const NotificationTemplateModel = require("../models/notificationTemplateModel");
const { firebaseStatus, legacyFirebaseStatus } = require("../../../config/firebase");
const { deliverNotification } = require("../utils/notification");
const {
  AUDIENCE_TYPES,
  CATEGORIES,
  MODULE_OPTIONS,
  TARGET_SCREENS,
  campaignCategoryForTemplate,
  campaignPlaceholders,
  carryApprovedLanguages,
  checkAudiencePermission,
  moduleOptionForTemplate,
  parseApprovedLanguages,
  renderCampaignForRecipient,
  validateCampaignInput,
  validateForSubmission,
} = require("../utils/campaignRules");
const {
  TemplateRenderError,
  approvedLanguagesFor,
  listPlaceholders,
  resolveModule,
} = require("../utils/notificationTemplate");
const { DEFAULT_TIMEZONE, EMPLOYEE_TIMEZONE, dayRangeUtc, sessionToUtcSql, toSqlUtc, utcOffsetString } = require("../utils/campaignSchedule");
const { buildCampaignPayload, buildDeliveryContext } = require("../../../services/Notifications/campaignWorker");
const MediaModel = require("../models/notificationMediaModel");
const { ANNOUNCEMENT_TYPES, CONTENT_TYPES, canSendNotifications, mediaIdForLanguage, mediaLanguageWarnings } = require("../utils/campaignRules");
const { DESTINATIONS, getDestination } = require("../utils/notificationDestinations");
const {
  ImageValidationError,
  checkImageAvailable,
  fetchAllowedImage,
  normalizeNotificationImage,
  notificationStorageKey,
} = require("../utils/notificationImage");
const { IMAGE_HOSTS } = require("../utils/notificationPayload");
const { uploadToR2 } = require("../../../utils/r2upload");
const { getPublicUrl } = require("../../../utils/publicUrl");

// Direct sending: an RM (or admin) with notifications.send sends or schedules
// their own campaigns without a second approver. pending_approval / approved /
// rejected remain valid statuses so historical campaigns stay readable and can
// be sent directly.
const EDITABLE_STATUSES = ["draft", "rejected", "pending_approval", "approved", "scheduled"];
const SENDABLE_STATUSES = ["draft", "rejected", "pending_approval", "approved", "scheduled"];
const CANCELLABLE_STATUSES = ["draft", "pending_approval", "approved", "scheduled", "sending"];
const RETRYABLE_ERROR_CODES = [
  "messaging/internal-error", "messaging/server-unavailable", "messaging/unknown-error",
  "app/network-error", "app/network-timeout", "messaging/third-party-auth-error",
  "messaging/mismatched-credential", "firebase_disabled", "internal_error",
];
// Sends to more employees than this need the RM to confirm the exact count.
const LARGE_SEND_THRESHOLD = Number(process.env.NOTIFICATION_LARGE_SEND_THRESHOLD || 200);

const isAdmin = (user) => user?.role === "admin";
const positiveInt = (value) => (Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null);

/** Dashboard from/to are calendar days in the employee timezone -> UTC bounds. */
function parseDateRange(query) {
  return dayRangeUtc(query.from, query.to, EMPLOYEE_TIMEZONE);
}

function handleError(res, error, context) {
  if (error instanceof ImageValidationError) {
    return res.status(422).json({ success: false, message: error.message });
  }
  if (error.code === "ER_NO_SUCH_TABLE" || error.code === "ER_BAD_FIELD_ERROR") {
    return res.status(503).json({
      success: false,
      code: "MIGRATION_REQUIRED",
      message: "Notification campaign tables are not fully installed. Apply migrations 20261026_02, 20261027_01 and 20261028_01.",
    });
  }
  console.error(`[RM Notifications] ${context}:`, error.message);
  return res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
}

async function deny(req, res, { action, reason, campaignId = null, status = 403 }) {
  await CampaignModel.audit({ campaignId, actor: req.user, action, decision: "denied", details: { reason }, ip: req.ip });
  return res.status(status).json({ success: false, message: reason });
}

function canManage(user, campaign) {
  return isAdmin(user) || Number(campaign.created_by) === Number(user.user_id);
}

function humanize(key) {
  return String(key).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/**
 * Template authority. Admins: everything. RMs: their OWN marketing/engagement
 * templates (created_by) - edit, approve translations explicitly, publish.
 * Unowned catalog templates and transactional templates are admin-managed.
 */
function templatePermissions(user, template) {
  if (isAdmin(user)) return { edit: true, publish: true, approveTranslations: true, owned: false };
  const owned = template.created_by != null && Number(template.created_by) === Number(user?.user_id);
  const promotional = ["marketing", "engagement"].includes(template.notification_type);
  const allowed = owned && promotional && canSendNotifications(user);
  return { edit: allowed, publish: allowed, approveTranslations: allowed, owned };
}

function serializeTemplate(template, user = null) {
  const approved = approvedLanguagesFor(template);
  const placeholders = [...new Set([
    ...listPlaceholders(template.title_en), ...listPlaceholders(template.body_en),
    ...listPlaceholders(template.title_hi), ...listPlaceholders(template.body_hi),
    ...listPlaceholders(template.title_mr), ...listPlaceholders(template.body_mr),
  ])];
  return {
    template_id: template.template_id,
    template_key: template.template_key,
    name: humanize(template.template_key),
    catalog_module: template.module,
    module: resolveModule(template),
    module_option: moduleOptionForTemplate(template),
    notification_type: template.notification_type,
    campaign_category: campaignCategoryForTemplate(template),
    priority: template.priority,
    title_en: template.title_en,
    body_en: template.body_en,
    title_hi: template.title_hi,
    body_hi: template.body_hi,
    title_mr: template.title_mr,
    body_mr: template.body_mr,
    has_hi: Boolean(template.title_hi && template.body_hi),
    has_mr: Boolean(template.title_mr && template.body_mr),
    approved_languages: [...approved],
    localization_status: template.localization_status,
    deep_link_pattern: template.deep_link_pattern,
    trigger_description: template.trigger_description,
    target_audience: template.target_audience,
    source_status: template.source_status,
    notes: template.notes,
    is_enabled: Number(template.is_enabled) === 1,
    created_by: template.created_by ?? null,
    permissions: user ? templatePermissions(user, template) : null,
    placeholders,
    updated_at: template.updated_at,
  };
}

function serializeCampaign(campaign, user) {
  if (!campaign) return null;
  return {
    ...campaign,
    approved_languages: parseApprovedLanguages(campaign.approved_languages),
    placeholders: campaignPlaceholders(campaign),
    can_manage: canManage(user, campaign),
    can_send: canManage(user, campaign) && canSendNotifications(user),
  };
}

/**
 * DB-backed checks for rich content: images must be active library assets
 * and the destination entity must exist and be promotable right now.
 * `checkReachable` also fetches each image the way a phone would (used
 * before submission/approval). Returns { errors, warnings, media }.
 */
async function validateRichContent(campaign, { checkReachable = false } = {}) {
  const errors = [];
  const ids = Object.values(campaign.media || {});
  const media = ids.length ? await MediaModel.findActiveByIds(ids) : [];
  const byId = new Map(media.map((row) => [Number(row.media_id), row]));
  for (const [slot, id] of Object.entries(campaign.media || {})) {
    if (!byId.has(Number(id))) errors.push(`The ${slot === "default" ? "default" : slot.toUpperCase()} image is no longer in the library.`);
  }

  const destination = campaign.destination_type ? getDestination(campaign.destination_type) : null;
  if (destination?.entity) {
    const status = await MediaModel.entityStatus(destination.entity, campaign.destination_id, (campaign.catalog_product_ids || []).map(Number));
    if (destination.entity === "product_list") {
      if (status.missing?.length) errors.push(`Products not listed in the shop: ${status.missing.join(", ")}.`);
      if (status.unavailable?.length) errors.push(`Products out of stock or without a visible price: ${status.unavailable.join(", ")}.`);
    } else if (!status.ok) {
      errors.push(`The selected ${destination.label.toLowerCase()} is unavailable or not published.`);
    }
  }

  if (checkReachable && campaign.content_type !== "standard") {
    const checked = new Set();
    for (const row of media) {
      if (checked.has(row.public_url)) continue;
      checked.add(row.public_url);
      const result = await checkImageAvailable(row.public_url);
      if (!result.ok) errors.push(`Image #${row.media_id} cannot be delivered (${result.reason}). Replace it before approval.`);
    }
  }

  return { errors, warnings: mediaLanguageWarnings(campaign, byId), media };
}

async function loadTemplates() {
  const [rows] = await db.query("SELECT * FROM notification_templates ORDER BY template_id");
  return rows;
}

async function loadTemplate(templateId) {
  const [[row]] = await db.query("SELECT * FROM notification_templates WHERE template_id = ?", [templateId]);
  return row || null;
}

class RmNotificationController {
  /* ================= META / SETTINGS ================= */
  async meta(req, res) {
    try {
      const scope = await AudienceModel.getScope(req.user);
      const testUsers = await AudienceModel.getTestUsers();
      let attemptsTable = true;
      try { await db.query("SELECT 1 FROM notification_push_attempts LIMIT 1"); } catch (error) { if (error.code === "ER_NO_SUCH_TABLE") attemptsTable = false; else throw error; }
      let campaignTables = true;
      try { await db.query("SELECT 1 FROM notification_campaigns LIMIT 1"); } catch (error) { if (error.code === "ER_NO_SUCH_TABLE") campaignTables = false; else throw error; }
      let mediaTables = true;
      try { await db.query("SELECT 1 FROM notification_media LIMIT 1"); } catch (error) { if (error.code === "ER_NO_SUCH_TABLE") mediaTables = false; else throw error; }

      return res.json({
        success: true,
        data: {
          role: req.user.role,
          modules: MODULE_OPTIONS.map(({ value, label, module, screen }) => ({ value, label, module, screen: screen || null })),
          categories: CATEGORIES,
          audienceTypes: AUDIENCE_TYPES,
          targetScreens: TARGET_SCREENS,
          contentTypes: CONTENT_TYPES,
          announcementTypes: Object.entries(ANNOUNCEMENT_TYPES).map(([value, label]) => ({ value, label })),
          destinations: DESTINATIONS.map(({ key, module, label, screen, entity, mobileRoute, campaignAllowed }) => ({
            key, module, label, screen, entity: entity || null, mobileRoute, campaignAllowed,
          })),
          imageHosts: IMAGE_HOSTS,
          defaultTimezone: DEFAULT_TIMEZONE,
          scope: { global: scope.global, companyCount: scope.companyIds.length, assignmentsAvailable: scope.assignmentsAvailable },
          testUsers: testUsers.map(({ user_id, name, language, has_device }) => ({ user_id, name, language, has_device })),
          firebase: {
            enabled: firebaseStatus.enabled,
            projectId: firebaseStatus.projectId,
            expectedProjectId: firebaseStatus.expectedProjectId,
            reason: firebaseStatus.reason,
            legacyEnabled: legacyFirebaseStatus.enabled,
            legacyProjectId: legacyFirebaseStatus.projectId,
          },
          permissions: {
            send: canSendNotifications(req.user),
            sendAllCompanies: scope.global,
            approveTranslations: true,
          },
          limits: {
            promotionalDailyCap: Number(process.env.NOTIFICATION_PROMO_DAILY_CAP || 2),
            largeSendThreshold: LARGE_SEND_THRESHOLD,
            employeeTimezone: EMPLOYEE_TIMEZONE,
          },
          infrastructure: { campaignTables, attemptsTable, mediaTables },
        },
      });
    } catch (error) {
      return handleError(res, error, "meta");
    }
  }

  /* ================= OVERVIEW ================= */
  async overview(req, res) {
    try {
      const scope = await AudienceModel.getScope(req.user);
      const scoped = AudienceModel.scopeFilter(scope);
      const { fromUtc, toUtc } = parseDateRange(req.query);
      const moduleOption = MODULE_OPTIONS.find((option) => option.value === req.query.module);

      const nWhere = [scoped.sql];
      const nParams = [...scoped.params];
      if (moduleOption) { nWhere.push("n.module = ?"); nParams.push(moduleOption.module); }
      if (fromUtc) { nWhere.push(`${sessionToUtcSql("n.created_at")} >= ?`); nParams.push(fromUtc); }
      if (toUtc) { nWhere.push(`${sessionToUtcSql("n.created_at")} < ?`); nParams.push(toUtc); }

      const [[notificationStats]] = await db.query(
        `SELECT COUNT(*) AS total, SUM(n.is_read = 1) AS read_count,
                SUM(JSON_UNQUOTE(JSON_EXTRACT(n.metadata, '$.source')) = 'campaign') AS campaign_rows
         FROM notifications n JOIN customer c ON c.user_id = n.user_id
         WHERE ${nWhere.join(" AND ")}`,
        nParams,
      );
      const [[templateStats]] = await db.query("SELECT COUNT(*) AS total, SUM(is_enabled = 1) AS enabled FROM notification_templates");
      const [[devices]] = await db.query(
        `SELECT SUM(upt.platform = 'android') AS android, SUM(upt.platform = 'ios') AS ios, SUM(upt.platform IS NULL) AS unknown_platform
         FROM user_push_tokens upt JOIN customer c ON c.user_id = upt.user_id
         WHERE upt.is_active = 1 AND ${scoped.sql}`,
        scoped.params,
      );

      let campaigns = null;
      try {
        const counts = await CampaignModel.statusCounts(req.user);
        campaigns = {
          scheduled: (counts.scheduled || 0) + (counts.sending || 0),
          pendingApproval: counts.pending_approval || 0,
          approved: counts.approved || 0,
          drafts: counts.draft || 0,
          completed: (counts.completed || 0) + (counts.partially_failed || 0),
          failed: counts.failed || 0,
        };
      } catch (error) {
        if (error.code !== "ER_NO_SUCH_TABLE") throw error;
      }

      let attempts = null;
      try {
        const aWhere = [scoped.sql];
        const aParams = [...scoped.params];
        if (fromUtc) { aWhere.push(`${sessionToUtcSql("a.created_at")} >= ?`); aParams.push(fromUtc); }
        if (toUtc) { aWhere.push(`${sessionToUtcSql("a.created_at")} < ?`); aParams.push(toUtc); }
        const [[row]] = await db.query(
          `SELECT SUM(a.status = 'accepted') AS accepted, SUM(a.status = 'failed') AS failed
           FROM notification_push_attempts a JOIN customer c ON c.user_id = a.user_id
           WHERE ${aWhere.join(" AND ")}`,
          aParams,
        );
        attempts = { firebaseAccepted: Number(row.accepted || 0), failed: Number(row.failed || 0) };
      } catch (error) {
        if (error.code !== "ER_NO_SUCH_TABLE") throw error;
      }

      return res.json({
        success: true,
        data: {
          operational: {
            notificationRecords: Number(notificationStats.total || 0),
            readInInbox: Number(notificationStats.read_count || 0),
            campaignNotificationRecords: Number(notificationStats.campaign_rows || 0),
            templates: Number(templateStats.total || 0),
            enabledTemplates: Number(templateStats.enabled || 0),
            androidRegistrations: Number(devices.android || 0),
            iosRegistrations: Number(devices.ios || 0),
            unknownPlatformRegistrations: Number(devices.unknown_platform || 0),
          },
          campaigns,
          attempts,
          // Opens are not instrumented: the app does not report notification
          // taps, and is_read only means the inbox item was read.
          opensTracked: false,
        },
      });
    } catch (error) {
      return handleError(res, error, "overview");
    }
  }

  /* ================= HISTORY ================= */
  async history(req, res) {
    try {
      const scope = await AudienceModel.getScope(req.user);
      const scoped = AudienceModel.scopeFilter(scope);
      const { fromUtc, toUtc } = parseDateRange(req.query);
      const where = [scoped.sql];
      const params = [...scoped.params];
      const moduleOption = MODULE_OPTIONS.find((option) => option.value === req.query.module);
      const companyId = positiveInt(req.query.company_id);

      if (companyId) { where.push("c.company_id = ?"); params.push(companyId); }
      if (moduleOption) { where.push("n.module = ?"); params.push(moduleOption.module); }
      if (req.query.type && /^[a-z0-9_]{1,60}$/.test(req.query.type)) { where.push("n.type = ?"); params.push(req.query.type); }
      if (["low", "normal", "high"].includes(req.query.priority)) { where.push("n.priority = ?"); params.push(req.query.priority); }
      if (req.query.is_read === "1" || req.query.is_read === "0") { where.push("n.is_read = ?"); params.push(Number(req.query.is_read)); }
      if (fromUtc) { where.push(`${sessionToUtcSql("n.created_at")} >= ?`); params.push(fromUtc); }
      if (toUtc) { where.push(`${sessionToUtcSql("n.created_at")} < ?`); params.push(toUtc); }
      if (req.query.source === "campaign") where.push("JSON_UNQUOTE(JSON_EXTRACT(n.metadata, '$.source')) = 'campaign'");
      if (req.query.source === "system") where.push("COALESCE(JSON_UNQUOTE(JSON_EXTRACT(n.metadata, '$.source')), '') <> 'campaign'");

      let campaignJoin = "";
      if (req.query.campaign_status && /^[a-z_]{1,20}$/.test(req.query.campaign_status)) {
        campaignJoin = "JOIN notification_campaigns nc ON nc.campaign_id = JSON_UNQUOTE(JSON_EXTRACT(n.metadata, '$.campaign_id'))";
        where.push("nc.status = ?");
        params.push(req.query.campaign_status);
      }

      const limit = Math.min(positiveInt(req.query.limit) || 25, 100);
      const page = positiveInt(req.query.page) || 1;
      const [[{ total }]] = await db.query(
        `SELECT COUNT(*) AS total FROM notifications n JOIN customer c ON c.user_id = n.user_id ${campaignJoin} WHERE ${where.join(" AND ")}`,
        params,
      );
      const [rows] = await db.query(
        `SELECT n.notification_id, n.user_id, c.name AS employee_name, co.company_name, n.module, n.type,
                n.title, n.message, n.priority, n.is_read,
                CONVERT_TZ(n.created_at, @@session.time_zone, '+00:00') AS created_at,
                JSON_UNQUOTE(JSON_EXTRACT(n.metadata, '$.source')) AS source,
                JSON_UNQUOTE(JSON_EXTRACT(n.metadata, '$.campaign_id')) AS campaign_id,
                JSON_UNQUOTE(JSON_EXTRACT(n.metadata, '$.language')) AS language
         FROM notifications n
         JOIN customer c ON c.user_id = n.user_id
         LEFT JOIN companies co ON co.company_id = c.company_id
         ${campaignJoin}
         WHERE ${where.join(" AND ")}
         ORDER BY n.notification_id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, (page - 1) * limit],
      );

      return res.json({
        success: true,
        data: {
          total: Number(total),
          page,
          limit,
          rows: rows.map((row) => ({
            ...row,
            source: row.source === "campaign" ? "campaign" : "system",
            // Chat notifications carry private message text.
            message: row.module === "chat" ? "Private message content hidden" : row.message,
          })),
        },
      });
    } catch (error) {
      return handleError(res, error, "history");
    }
  }

  /* ================= TEMPLATES ================= */
  async listTemplates(req, res) {
    try {
      const search = String(req.query.search || "").trim().toLowerCase();
      const moduleOption = MODULE_OPTIONS.find((option) => option.value === req.query.module);
      let templates = (await loadTemplates()).map((template) => serializeTemplate(template, req.user));

      if (moduleOption) templates = templates.filter((template) => template.module === moduleOption.module);
      if (["transactional", "marketing", "engagement"].includes(req.query.type)) {
        templates = templates.filter((template) => template.notification_type === req.query.type);
      }
      const enabled = String(req.query.enabled ?? "");
      if (enabled === "1" || enabled === "0") {
        templates = templates.filter((template) => template.is_enabled === (enabled === "1"));
      }
      if (String(req.query.usable ?? "") === "1") templates = templates.filter((template) => template.campaign_category);
      if (search) {
        templates = templates.filter((template) => [template.template_key, template.name, template.title_en, template.body_en]
          .some((value) => String(value || "").toLowerCase().includes(search)));
      }

      const limit = Math.min(positiveInt(req.query.limit) || 20, 100);
      const page = positiveInt(req.query.page) || 1;
      return res.json({
        success: true,
        data: { total: templates.length, page, limit, rows: templates.slice((page - 1) * limit, page * limit) },
      });
    } catch (error) {
      return handleError(res, error, "list templates");
    }
  }

  async getTemplate(req, res) {
    try {
      const template = await loadTemplate(positiveInt(req.params.id));
      if (!template) return res.status(404).json({ success: false, message: "Template not found" });
      return res.json({ success: true, data: serializeTemplate(template, req.user) });
    } catch (error) {
      return handleError(res, error, "get template");
    }
  }

  async createTemplate(req, res) {
    try {
      const body = req.body || {};
      const canSend = canSendNotifications(req.user);
      const key = String(body.template_key || "").trim();
      if (!/^[a-z0-9_]{3,100}$/.test(key)) {
        return res.status(400).json({ success: false, message: "Template key must be 3-100 lowercase letters, digits or underscores." });
      }
      const moduleOption = MODULE_OPTIONS.find((option) => option.value === body.module);
      if (!moduleOption) return res.status(400).json({ success: false, message: "Select a valid module." });

      // RMs create promotional templates only; event (transactional) templates
      // are reserved for admins so campaigns cannot impersonate system events.
      const type = ["marketing", "engagement"].includes(body.notification_type) || (isAdmin(req.user) && body.notification_type === "transactional")
        ? body.notification_type
        : null;
      if (!type) return res.status(400).json({ success: false, message: "Select marketing or engagement as the notification type." });

      const { value, errors } = validateCampaignInput({ ...body, name: key, category: "marketing", module: moduleOption.value });
      const contentErrors = errors.filter((error) => /title|message|Hindi|Marathi/i.test(error));
      if (contentErrors.length) return res.status(400).json({ success: false, message: contentErrors.join(" "), errors: contentErrors });

      // The author approves their own translations explicitly (checkbox per
      // language) and may publish their own promotional template at once.
      const approved = canSend
        ? parseApprovedLanguages(body.approved_languages).filter((lang) => value[`title_${lang}`] && value[`body_${lang}`])
        : [];
      const publish = canSend && Boolean(body.is_enabled) && (type !== "transactional" || isAdmin(req.user));

      const columns = ["template_key", "module", "trigger_description", "target_audience", "notification_type", "priority",
        "title_en", "body_en", "title_mr", "body_mr", "title_hi", "body_hi", "deep_link_pattern",
        "source_status", "localization_status", "notes", "is_enabled", "created_by"];
      const values = [
        key, moduleOption.module,
        String(body.trigger_description || "Created in the RM Notification Manager for campaigns.").slice(0, 2000),
        String(body.target_audience || "Campaign audience").slice(0, 255),
        type, value.priority,
        value.title_en, value.body_en, value.title_mr, value.body_mr, value.title_hi, value.body_hi, null,
        "dashboard_created", `approved:${approved.join(",")}`,
        body.notes ? String(body.notes).slice(0, 2000) : null,
        publish ? 1 : 0, req.user.user_id,
      ];
      let result;
      let warning = null;
      try {
        [result] = await db.query(`INSERT INTO notification_templates (${columns.join(", ")}) VALUES (?)`, [values]);
      } catch (error) {
        if (error.code !== "ER_BAD_FIELD_ERROR") throw error;
        // notification_templates.created_by not added yet (migration 20261028_01):
        // without an owner the template stays unpublished and admin-managed.
        const draftValues = values.slice(0, -1);
        draftValues[columns.indexOf("localization_status")] = "approved:";
        draftValues[columns.indexOf("is_enabled")] = 0;
        [result] = await db.query(
          `INSERT INTO notification_templates (${columns.slice(0, -1).join(", ")}) VALUES (?)`,
          [draftValues],
        );
        warning = "Saved as a draft template. Apply migration 20261028_01 to let RMs publish their own templates.";
      }
      NotificationTemplateModel.clearCache();
      await CampaignModel.audit({ actor: req.user, action: "template_created", details: { template_id: result.insertId, template_key: key, published: publish && !warning }, ip: req.ip });
      return res.status(201).json({ success: true, warning, data: serializeTemplate(await loadTemplate(result.insertId), req.user) });
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "A template with this key already exists." });
      return handleError(res, error, "create template");
    }
  }

  async updateTemplate(req, res) {
    try {
      const template = await loadTemplate(positiveInt(req.params.id));
      if (!template) return res.status(404).json({ success: false, message: "Template not found" });
      const admin = isAdmin(req.user);
      const perms = templatePermissions(req.user, template);
      const body = req.body || {};

      // System catalog templates (no owner) and other RMs' templates are
      // admin-managed; an RM fully manages the promotional templates they own.
      if (!perms.edit) {
        return deny(req, res, { action: "template_update", reason: "Only an admin, or the RM who created this marketing/engagement template, can change it." });
      }
      if (!admin && "deep_link_pattern" in body) {
        return deny(req, res, { action: "template_update", reason: "Only an admin can change template deep links." });
      }

      const next = {
        title_en: body.title_en ?? template.title_en,
        body_en: body.body_en ?? template.body_en,
        title_hi: body.title_hi === undefined ? template.title_hi : body.title_hi || null,
        body_hi: body.body_hi === undefined ? template.body_hi : body.body_hi || null,
        title_mr: body.title_mr === undefined ? template.title_mr : body.title_mr || null,
        body_mr: body.body_mr === undefined ? template.body_mr : body.body_mr || null,
      };
      const { value, errors } = validateCampaignInput({ ...next, name: template.template_key, category: "marketing", module: "common", priority: body.priority ?? template.priority });
      const contentErrors = errors.filter((error) => /title|message|Hindi|Marathi/i.test(error));
      if (contentErrors.length) return res.status(400).json({ success: false, message: contentErrors.join(" "), errors: contentErrors });

      let deepLink = template.deep_link_pattern;
      if (admin && "deep_link_pattern" in body) {
        deepLink = body.deep_link_pattern ? String(body.deep_link_pattern) : null;
        if (deepLink && !/^rp:\/\/[a-z0-9\-/{}_]{1,200}$/.test(deepLink)) {
          return res.status(400).json({ success: false, message: "Deep links must use the rp:// scheme with simple path segments." });
        }
      }

      const previous = { ...template, approved_languages: [...approvedLanguagesFor(template)].join(",") };
      const approved = carryApprovedLanguages(previous, value, parseApprovedLanguages(body.approved_languages), perms.approveTranslations);
      const isEnabled = perms.publish && "is_enabled" in body ? (body.is_enabled ? 1 : 0) : Number(template.is_enabled);

      await db.query(
        `UPDATE notification_templates
         SET title_en = ?, body_en = ?, title_hi = ?, body_hi = ?, title_mr = ?, body_mr = ?,
             priority = ?, deep_link_pattern = ?, localization_status = ?, is_enabled = ?
         WHERE template_id = ?`,
        [value.title_en, value.body_en, value.title_hi, value.body_hi, value.title_mr, value.body_mr,
          value.priority, deepLink, `approved:${approved}`, isEnabled, template.template_id],
      );
      NotificationTemplateModel.clearCache();
      await CampaignModel.audit({
        actor: req.user,
        action: "template_updated",
        details: { template_id: template.template_id, enabled: isEnabled, approved_languages: approved },
        ip: req.ip,
      });
      return res.json({ success: true, data: serializeTemplate(await loadTemplate(template.template_id), req.user) });
    } catch (error) {
      return handleError(res, error, "update template");
    }
  }

  /* ================= CAMPAIGNS ================= */

  /**
   * Validate a create/update body into column values. Template campaigns take
   * their category from the template, and translation approvals carry over
   * only for text that is unchanged from what was approved.
   */
  async buildCampaignValues(req, previous = null) {
    const body = { ...(req.body || {}) };
    let template = null;
    const templateErrors = [];

    // A template fixes the category (so announcement rules and consent apply
    // to the template's real nature, not to what the request claims).
    if (body.source === "template" && positiveInt(body.template_id)) {
      template = await loadTemplate(positiveInt(body.template_id));
      if (!template) templateErrors.push("Template not found.");
      else {
        const category = campaignCategoryForTemplate(template);
        if (!category) templateErrors.push("This is an event template used by the system (e.g. order or payment updates) and cannot be sent as a campaign.");
        else body.category = category;
      }
    }
    const { value, errors } = validateCampaignInput(body);
    errors.unshift(...templateErrors);

    // The sender reviews and publishes their own translations (no admin step),
    // but only through the explicit per-language checkbox: unreviewed or
    // edited translations are never approved implicitly.
    const baseline = previous || (template
      ? { ...template, approved_languages: [...approvedLanguagesFor(template)].join(",") }
      : { approved_languages: "" });
    value.approved_languages = carryApprovedLanguages(baseline, value, value.approved_languages, canSendNotifications(req.user));
    delete value.module_option;
    return { value, errors, template };
  }

  async loadManaged(req, res, action) {
    const campaignId = positiveInt(req.params.id);
    const campaign = campaignId ? await CampaignModel.findById(campaignId) : null;
    if (!campaign) {
      res.status(404).json({ success: false, message: "Campaign not found" });
      return null;
    }
    if (!canManage(req.user, campaign)) {
      await deny(req, res, { action, campaignId, reason: "You can only manage campaigns you created.", status: 404 });
      return null;
    }
    return campaign;
  }

  async listCampaigns(req, res) {
    try {
      const statuses = String(req.query.status || "").split(",").map((status) => status.trim()).filter((status) => /^[a-z_]{1,20}$/.test(status));
      const moduleOption = MODULE_OPTIONS.find((option) => option.value === req.query.module);
      const result = await CampaignModel.list(req.user, {
        statuses,
        module: moduleOption?.module || null,
        search: String(req.query.search || "").trim().slice(0, 100),
        page: req.query.page,
        limit: req.query.limit,
      });
      return res.json({ success: true, data: { ...result, rows: result.rows.map((row) => serializeCampaign(row, req.user)) } });
    } catch (error) {
      return handleError(res, error, "list campaigns");
    }
  }

  async getCampaign(req, res) {
    try {
      const campaign = await this.loadManaged(req, res, "view");
      if (!campaign) return undefined;
      const [summary, audit, rich] = await Promise.all([
        CampaignModel.recipientSummary(campaign.campaign_id),
        CampaignModel.auditTrail(campaign.campaign_id),
        validateRichContent(campaign),
      ]);
      const products = campaign.catalog_product_ids?.length ? await MediaModel.productsByIds(campaign.catalog_product_ids.map(Number)) : [];
      return res.json({
        success: true,
        data: {
          ...serializeCampaign(campaign, req.user),
          summary,
          audit,
          media_assets: rich.media,
          catalog_products: products,
          destination: campaign.destination_type ? getDestination(campaign.destination_type) : null,
          warnings: [...rich.warnings, ...rich.errors],
        },
      });
    } catch (error) {
      return handleError(res, error, "get campaign");
    }
  }

  async createCampaign(req, res) {
    try {
      // Double-click / concurrent-request protection: the dashboard sends one
      // client_request_id per compose session, stored under a UNIQUE
      // (created_by, client_request_id) key, so only one insert can win.
      const clientRequestId = typeof req.body?.client_request_id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(req.body.client_request_id)
        ? req.body.client_request_id
        : null;
      const returnExisting = async () => {
        const existingId = clientRequestId ? await CampaignModel.findByClientRequest(req.user.user_id, clientRequestId) : null;
        return existingId
          ? res.status(200).json({ success: true, duplicate: true, data: serializeCampaign(await CampaignModel.findById(existingId), req.user) })
          : null;
      };
      if (clientRequestId) {
        const sent = await returnExisting();
        if (sent) return sent;
      }

      const { value, errors } = await this.buildCampaignValues(req);
      if (!errors.length) errors.push(...(await validateRichContent(value)).errors);
      if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

      const scope = await AudienceModel.getScope(req.user);
      const permission = checkAudiencePermission(value.audience_type, value.audience_filter, scope);
      if (!permission.allowed) return deny(req, res, { action: "create", reason: permission.reason });

      value.estimated_recipients = (await AudienceModel.preview(value.audience_type, value.audience_filter, scope)).total;
      let campaignId;
      try {
        campaignId = await CampaignModel.create(value, req.user, { clientRequestId });
      } catch (error) {
        // A concurrent request with the same id won the race.
        if (error.code === "ER_DUP_ENTRY" && clientRequestId) {
          const sent = await returnExisting();
          if (sent) return sent;
        }
        throw error;
      }
      await CampaignModel.audit({
        campaignId, actor: req.user, action: "created",
        details: { audience_type: value.audience_type, category: value.category },
        ip: req.ip,
      });
      return res.status(201).json({ success: true, data: serializeCampaign(await CampaignModel.findById(campaignId), req.user) });
    } catch (error) {
      return handleError(res, error, "create campaign");
    }
  }

  async updateCampaign(req, res) {
    try {
      const campaign = await this.loadManaged(req, res, "update");
      if (!campaign) return undefined;
      if (!EDITABLE_STATUSES.includes(campaign.status) || (campaign.status === "scheduled" && campaign.occurrences_started > 0)) {
        return res.status(409).json({ success: false, message: "This campaign has started sending. Cancel it and create a new campaign instead." });
      }

      const { value, errors } = await this.buildCampaignValues(req, campaign);
      if (!errors.length) errors.push(...(await validateRichContent(value)).errors);
      if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

      const scope = await AudienceModel.getScope(req.user);
      const permission = checkAudiencePermission(value.audience_type, value.audience_filter, scope);
      if (!permission.allowed) return deny(req, res, { action: "update", campaignId: campaign.campaign_id, reason: permission.reason });

      value.estimated_recipients = (await AudienceModel.preview(value.audience_type, value.audience_filter, scope)).total;
      const updated = await CampaignModel.update(campaign.campaign_id, value, req.user, EDITABLE_STATUSES);
      if (!updated) return res.status(409).json({ success: false, message: "The campaign changed while you were editing. Reload and try again." });

      // Editing an unsent campaign takes it off the schedule until it is sent
      // or scheduled again. Historical approval fields are kept, not erased.
      if (campaign.status !== "draft") {
        await CampaignModel.transition(campaign.campaign_id, EDITABLE_STATUSES, "draft", { next_run_at: null });
      }
      await CampaignModel.audit({ campaignId: campaign.campaign_id, actor: req.user, action: "updated", details: { previous_status: campaign.status }, ip: req.ip });
      return res.json({ success: true, data: serializeCampaign(await CampaignModel.findById(campaign.campaign_id), req.user) });
    } catch (error) {
      return handleError(res, error, "update campaign");
    }
  }

  /** Sends only to the NOTIFICATION_TEST_USER_IDS allow-list, never to the audience. */
  async testCampaign(req, res) {
    try {
      const campaign = await this.loadManaged(req, res, "test");
      if (!campaign) return undefined;
      if (["cancelled", "expired"].includes(campaign.status)) {
        return res.status(409).json({ success: false, message: "Cancelled campaigns cannot be tested." });
      }

      const testUsers = await AudienceModel.getTestUsers();
      const requested = Array.isArray(req.body?.user_ids) ? req.body.user_ids.map(Number) : null;
      const targets = requested ? testUsers.filter((user) => requested.includes(Number(user.user_id))) : testUsers;
      if (!targets.length) {
        return deny(req, res, {
          action: "test",
          campaignId: campaign.campaign_id,
          status: 400,
          reason: "No authorised test users are configured. Ask an admin to set NOTIFICATION_TEST_USER_IDS.",
        });
      }

      const forcedLanguage = ["en", "hi", "mr"].includes(req.body?.language) ? req.body.language : null;
      // Same image/destination checks as a real send, so the test is faithful.
      const delivery = await buildDeliveryContext(campaign);
      const results = [];
      for (const user of targets) {
        let rendered;
        try {
          rendered = renderCampaignForRecipient(campaign, { language: forcedLanguage || user.language, firstName: String(user.name || "").split(/\s+/)[0] });
        } catch (error) {
          if (!(error instanceof TemplateRenderError)) throw error;
          return res.status(400).json({ success: false, message: error.message });
        }
        const payload = buildCampaignPayload(campaign, { user_id: user.user_id, occurrence_no: 0 }, rendered, delivery);
        payload.idempotency_key = `campaign-test:${campaign.campaign_id}:${user.user_id}:${Date.now()}`;
        payload.title = `[TEST] ${payload.title}`.slice(0, 255);
        payload.metadata = { ...payload.metadata, test: true };

        // Test sends go only to the NOTIFICATION_TEST_USER_IDS allow-list of
        // development accounts, so consent/quiet-hour rules are not applied.
        const outcome = await deliverNotification(payload, { policy: "checked" });
        results.push({
          user_id: user.user_id,
          name: user.name,
          language: rendered.language,
          image_sent: Boolean(payload.image_url),
          image_fallback: Boolean(payload.metadata.image_fallback),
          destination: payload.screen || null,
          destination_blocked: delivery.blocked,
          inbox_saved: Boolean(outcome.notificationId),
          devices_attempted: outcome.results?.length || 0,
          firebase_accepted: outcome.sent || 0,
          skipped_reason: outcome.skipped ? outcome.reason : null,
          errors: (outcome.results || []).filter((item) => !item.success).map((item) => item.errorCode),
        });
      }

      await CampaignModel.audit({ campaignId: campaign.campaign_id, actor: req.user, action: "test_sent", details: { users: results.map((item) => item.user_id) }, ip: req.ip });
      return res.json({ success: true, data: results });
    } catch (error) {
      return handleError(res, error, "test campaign");
    }
  }

  /**
   * Send Now or Schedule, directly by the sender (no admin approval).
   * body: { mode: "now" | "schedule", send_date?, send_time?, timezone?, confirm_recipients? }
   * Also reschedules (or sends now) a scheduled campaign that has not started.
   * The status change is a compare-and-set, so repeated clicks cannot queue
   * the campaign twice, and recipients are materialised once per occurrence.
   */
  async sendCampaign(req, res) {
    try {
      const campaign = await this.loadManaged(req, res, "send");
      if (!campaign) return undefined;
      if (!canSendNotifications(req.user)) {
        return deny(req, res, { action: "send", campaignId: campaign.campaign_id, reason: "Your account is not allowed to send notifications." });
      }
      const notStarted = Number(campaign.occurrences_started || 0) === 0;
      if (!SENDABLE_STATUSES.includes(campaign.status) || (campaign.status === "scheduled" && !notStarted)) {
        return res.status(409).json({ success: false, message: "This campaign has already started sending or is closed." });
      }

      const mode = req.body?.mode === "now" ? "now" : "schedule";
      const now = new Date();

      // Resolve the delivery time: Send Now ignores any stored schedule.
      let deliveryMode = mode === "now" ? "now" : campaign.delivery_mode === "now" ? "once" : campaign.delivery_mode;
      let scheduledAt = mode === "now" ? now : campaign.scheduled_at;
      let timezone = campaign.timezone;
      if (mode === "schedule" && (req.body?.send_date || req.body?.send_time)) {
        const moduleValue = MODULE_OPTIONS.find((option) => option.module === campaign.module && !option.screen)?.value || "common";
        const { value, errors } = validateCampaignInput({ ...campaign, module: moduleValue, ...req.body, delivery_mode: deliveryMode });
        const timeErrors = errors.filter((error) => /date|time|Expiry/i.test(error));
        if (timeErrors.length) return res.status(400).json({ success: false, message: timeErrors[0] });
        scheduledAt = value.scheduled_at;
        timezone = value.timezone;
      }

      const errors = validateForSubmission({ ...campaign, delivery_mode: deliveryMode, scheduled_at: scheduledAt }, now);
      if (campaign.expires_at && scheduledAt && scheduledAt >= campaign.expires_at) errors.push("The campaign expires before it would be sent.");
      if (campaign.source === "template") {
        const template = await loadTemplate(campaign.template_id);
        if (!template || Number(template.is_enabled) !== 1) {
          errors.push("The selected template is disabled. Ask an admin to enable it, or switch to \"Write a new notification\".");
        }
      }
      errors.push(...(await validateRichContent(campaign, { checkReachable: true })).errors);
      if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

      const scope = await AudienceModel.getScope(req.user);
      const permission = checkAudiencePermission(campaign.audience_type, campaign.audience_filter, scope);
      if (!permission.allowed) return deny(req, res, { action: "send", campaignId: campaign.campaign_id, reason: permission.reason });

      const preview = await AudienceModel.preview(campaign.audience_type, campaign.audience_filter, scope);
      if (!preview.total) return res.status(400).json({ success: false, message: "The selected audience has no active employees." });

      // Truthful status: never accept Send Now when pushes cannot leave.
      if (mode === "now" && !firebaseStatus.enabled) {
        return res.status(409).json({
          success: false,
          code: "FIREBASE_UNAVAILABLE",
          message: `Push sending is not configured on the server (${firebaseStatus.reason || "Firebase disabled"}). Save as draft or schedule for later.`,
        });
      }

      // One explicit confirmation of the exact audience size for large sends.
      if (preview.total > LARGE_SEND_THRESHOLD && Number(req.body?.confirm_recipients) !== preview.total) {
        return res.status(409).json({
          success: false,
          code: "CONFIRMATION_REQUIRED",
          message: `This will reach ${preview.total} employees. Confirm the recipient count to continue.`,
          recipients: preview.total,
        });
      }

      const moved = await CampaignModel.transition(campaign.campaign_id, SENDABLE_STATUSES, "scheduled", {
        delivery_mode: deliveryMode,
        scheduled_at: scheduledAt,
        timezone,
        next_run_at: scheduledAt,
        submitted_at: now,
        estimated_recipients: preview.total,
        rejection_reason: null,
      });
      if (!moved) return res.status(409).json({ success: false, message: "The campaign changed. Reload and try again." });
      await CampaignModel.audit({
        campaignId: campaign.campaign_id,
        actor: req.user,
        action: mode === "now" ? "send_now" : "scheduled",
        details: {
          next_run_at: toSqlUtc(scheduledAt), timezone, recipients: preview.total, eligible_languages: preview.languages,
          approved_languages: campaign.approved_languages || "",
        },
        ip: req.ip,
      });

      return res.json({
        success: true,
        data: serializeCampaign(await CampaignModel.findById(campaign.campaign_id), req.user),
        warning: !firebaseStatus.enabled
          ? "Firebase is not configured. The campaign stays queued and is sent once push credentials are installed."
          : null,
      });
    } catch (error) {
      return handleError(res, error, "send campaign");
    }
  }

  /**
   * Re-queue recipients whose push failed for a retryable reason (Firebase
   * outage, configuration, network). Their inbox row already exists and is
   * reused, so a retry never creates a second notification.
   */
  async retryFailed(req, res) {
    try {
      const campaign = await this.loadManaged(req, res, "retry");
      if (!campaign) return undefined;
      if (!canSendNotifications(req.user)) return deny(req, res, { action: "retry", campaignId: campaign.campaign_id, reason: "Your account is not allowed to send notifications." });
      if (!["completed", "partially_failed", "failed"].includes(campaign.status)) {
        return res.status(409).json({ success: false, message: "Only finished campaigns with failures can be retried." });
      }
      if (!firebaseStatus.enabled) {
        return res.status(409).json({ success: false, code: "FIREBASE_UNAVAILABLE", message: "Push sending is not configured on the server, so a retry would fail again." });
      }

      const requeued = await CampaignModel.requeueFailedRecipients(campaign.campaign_id, campaign.occurrences_started, RETRYABLE_ERROR_CODES);
      if (!requeued) return res.status(409).json({ success: false, message: "No failed recipients are eligible for retry (permanent errors such as invalid devices are not retried)." });
      await CampaignModel.transition(campaign.campaign_id, ["completed", "partially_failed", "failed"], "sending");
      await CampaignModel.audit({ campaignId: campaign.campaign_id, actor: req.user, action: "retry_failed", details: { requeued }, ip: req.ip });
      return res.json({ success: true, requeued, data: serializeCampaign(await CampaignModel.findById(campaign.campaign_id), req.user) });
    } catch (error) {
      return handleError(res, error, "retry failed");
    }
  }

  async cancelCampaign(req, res) {
    try {
      const campaign = await this.loadManaged(req, res, "cancel");
      if (!campaign) return undefined;
      const moved = await CampaignModel.transition(campaign.campaign_id, CANCELLABLE_STATUSES, "cancelled", {
        cancelled_by: req.user.user_id, cancelled_at: new Date(), next_run_at: null,
      });
      if (!moved) return res.status(409).json({ success: false, message: "This campaign can no longer be cancelled." });
      const cancelledRecipients = await CampaignModel.cancelPendingRecipients(campaign.campaign_id);
      await CampaignModel.audit({ campaignId: campaign.campaign_id, actor: req.user, action: "cancelled", details: { previous_status: campaign.status, cancelled_recipients: cancelledRecipients }, ip: req.ip });
      return res.json({ success: true, data: serializeCampaign(await CampaignModel.findById(campaign.campaign_id), req.user) });
    } catch (error) {
      return handleError(res, error, "cancel campaign");
    }
  }

  async campaignRecipients(req, res) {
    try {
      const campaign = await this.loadManaged(req, res, "view_recipients");
      if (!campaign) return undefined;
      const status = ["pending", "processing", "sent", "inbox_only", "failed", "skipped", "cancelled"].includes(req.query.status) ? req.query.status : null;
      const data = await CampaignModel.listRecipients(campaign.campaign_id, { status, page: req.query.page, limit: req.query.limit });
      return res.json({ success: true, data });
    } catch (error) {
      return handleError(res, error, "campaign recipients");
    }
  }

  async campaignAttempts(req, res) {
    try {
      const campaign = await this.loadManaged(req, res, "view_attempts");
      if (!campaign) return undefined;
      const data = await CampaignModel.listAttempts(campaign.campaign_id, { page: req.query.page, limit: req.query.limit });
      return res.json({ success: true, data });
    } catch (error) {
      return handleError(res, error, "campaign attempts");
    }
  }

  /* ================= AUDIENCE ================= */
  async previewAudience(req, res) {
    try {
      const { value } = validateCampaignInput({ ...(req.body || {}), name: "preview", module: "common", category: req.body?.category || "marketing", title_en: "x", body_en: "x" });
      const scope = await AudienceModel.getScope(req.user);
      const permission = checkAudiencePermission(value.audience_type, value.audience_filter, scope);
      if (!permission.allowed) return res.json({ success: true, data: { allowed: false, reason: permission.reason } });

      const preview = await AudienceModel.preview(value.audience_type, value.audience_filter, scope);
      const eligible = value.category === "marketing" ? preview.marketingConsented
        : value.category === "engagement" ? preview.engagementConsented
          : preview.total;
      return res.json({ success: true, data: { allowed: true, ...preview, eligible, category: value.category } });
    } catch (error) {
      return handleError(res, error, "audience preview");
    }
  }

  async audienceCompanies(req, res) {
    try {
      const scope = await AudienceModel.getScope(req.user);
      return res.json({ success: true, data: await AudienceModel.listCompanies(scope) });
    } catch (error) {
      return handleError(res, error, "audience companies");
    }
  }

  async audienceEmployees(req, res) {
    try {
      const scope = await AudienceModel.getScope(req.user);
      const rows = await AudienceModel.searchEmployees(scope, {
        search: String(req.query.search || "").trim().slice(0, 80),
        companyId: positiveInt(req.query.company_id),
      });
      return res.json({ success: true, data: rows });
    } catch (error) {
      return handleError(res, error, "audience employees");
    }
  }

  /** Server-side render of all three languages, using the delivery code path. */
  async renderPreview(req, res) {
    try {
      const { value } = validateCampaignInput({ ...(req.body || {}), name: req.body?.name || "preview", category: req.body?.category || "marketing" });
      const campaign = { ...value, approved_languages: parseApprovedLanguages(req.body?.approved_languages).join(",") };
      const previews = {};
      for (const language of ["en", "hi", "mr"]) {
        try {
          const rendered = renderCampaignForRecipient(campaign, { language, firstName: "Asha" });
          previews[language] = { ...rendered, fallback: rendered.language !== language };
        } catch (error) {
          if (!(error instanceof TemplateRenderError)) throw error;
          previews[language] = { error: error.message, missing: error.missing };
        }
      }
      return res.json({ success: true, data: previews });
    } catch (error) {
      return handleError(res, error, "render preview");
    }
  }

  /* ================= ANALYTICS ================= */
  async analytics(req, res) {
    try {
      const { fromUtc, toUtc } = parseDateRange(req.query);
      const visible = CampaignModel.visibilityFilter(req.user);
      const where = [visible.sql];
      const params = [...visible.params];
      if (fromUtc) { where.push(`${sessionToUtcSql("r.created_at")} >= ?`); params.push(fromUtc); }
      if (toUtc) { where.push(`${sessionToUtcSql("r.created_at")} < ?`); params.push(toUtc); }

      const [byModule] = await db.query(
        `SELECT nc.module, COUNT(DISTINCT nc.campaign_id) AS campaigns, COUNT(r.recipient_id) AS recipients,
                SUM(r.status = 'sent') AS sent, SUM(r.devices_accepted > 0) AS firebase_accepted,
                SUM(r.status = 'failed') AS failed, SUM(r.status = 'skipped') AS skipped, SUM(n.is_read = 1) AS read_in_inbox
         FROM notification_campaign_recipients r
         JOIN notification_campaigns nc ON nc.campaign_id = r.campaign_id
         LEFT JOIN notifications n ON n.notification_id = r.notification_id
         WHERE ${where.join(" AND ")}
         GROUP BY nc.module ORDER BY recipients DESC`,
        params,
      );
      const [byLanguage] = await db.query(
        `SELECT r.language, COUNT(*) AS recipients, SUM(r.status = 'sent') AS sent
         FROM notification_campaign_recipients r JOIN notification_campaigns nc ON nc.campaign_id = r.campaign_id
         WHERE ${where.join(" AND ")} GROUP BY r.language`,
        params,
      );
      const [skipReasons] = await db.query(
        `SELECT COALESCE(r.skip_reason, r.last_error_code) AS reason, r.status, COUNT(*) AS total
         FROM notification_campaign_recipients r JOIN notification_campaigns nc ON nc.campaign_id = r.campaign_id
         WHERE ${where.join(" AND ")} AND r.status IN ('skipped', 'failed')
         GROUP BY reason, r.status ORDER BY total DESC LIMIT 20`,
        params,
      );
      // Days are calendar days in the employee timezone (not the DB session's).
      const employeeOffset = utcOffsetString(EMPLOYEE_TIMEZONE);
      const [byDay] = await db.query(
        `SELECT DATE(CONVERT_TZ(r.updated_at, @@session.time_zone, ?)) AS day, SUM(r.status = 'sent') AS sent,
                SUM(r.devices_accepted > 0) AS firebase_accepted, SUM(r.status = 'inbox_only') AS inbox_only, SUM(r.status = 'failed') AS failed
         FROM notification_campaign_recipients r JOIN notification_campaigns nc ON nc.campaign_id = r.campaign_id
         WHERE ${where.join(" AND ")} GROUP BY DATE(CONVERT_TZ(r.updated_at, @@session.time_zone, ?)) ORDER BY day DESC LIMIT 31`,
        [employeeOffset, ...params, employeeOffset],
      );

      // Rich-content breakdowns need migration 20261028_01; text analytics work without it.
      let byContent = [];
      let opensAvailable = false;
      try {
        [byContent] = await db.query(
          `SELECT nc.content_type, COALESCE(nc.destination_type, 'module_default') AS destination_type,
                  COUNT(DISTINCT nc.campaign_id) AS campaigns, COUNT(r.recipient_id) AS recipients,
                  SUM(r.devices_accepted > 0) AS firebase_accepted, SUM(r.status = 'failed') AS failed,
                  SUM(r.attempts > 1) AS retried, SUM(r.image_fallback = 1) AS image_fallbacks,
                  SUM(oe.outcome = 'opened_target') AS opened_target, SUM(oe.outcome = 'fallback') AS opened_fallback
           FROM notification_campaign_recipients r
           JOIN notification_campaigns nc ON nc.campaign_id = r.campaign_id
           LEFT JOIN notification_open_events oe ON oe.notification_id = r.notification_id
           WHERE ${where.join(" AND ")}
           GROUP BY nc.content_type, COALESCE(nc.destination_type, 'module_default')
           ORDER BY recipients DESC`,
          params,
        );
        opensAvailable = true;
      } catch (error) {
        if (!["ER_NO_SUCH_TABLE", "ER_BAD_FIELD_ERROR"].includes(error.code)) throw error;
      }

      const n = (rows) => rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" && /^\d+$/.test(value) && key !== "day" ? Number(value) : value])));
      return res.json({
        success: true,
        data: { byModule: n(byModule), byLanguage: n(byLanguage), skipReasons: n(skipReasons), byDay: n(byDay), byContent: n(byContent), opensAvailable },
      });
    } catch (error) {
      return handleError(res, error, "analytics");
    }
  }

  /* ================= CATALOG (read-only, existing product/service tables) ================= */
  // The catalog is shared across companies, so it is not RM-scoped; the
  // audience (who receives the campaign) remains company-scoped.
  async catalogProducts(req, res) {
    try {
      const ids = String(req.query.ids || "").split(",").map(Number).filter((id) => Number.isSafeInteger(id) && id > 0).slice(0, 20);
      const data = ids.length
        ? await MediaModel.productsByIds(ids)
        : await MediaModel.searchProducts({ search: String(req.query.search || "").trim().slice(0, 80), categoryId: positiveInt(req.query.category_id) });
      return res.json({ success: true, data });
    } catch (error) {
      return handleError(res, error, "catalog products");
    }
  }

  async catalogOptions(req, res) {
    try {
      const kind = req.params.kind;
      const loaders = {
        categories: () => MediaModel.listCategories(),
        services: () => MediaModel.listServices({ search: String(req.query.search || "").trim().slice(0, 80) }),
        "service-categories": () => MediaModel.listServiceCategories(),
        "service-banners": () => MediaModel.listServiceBanners(),
      };
      if (!loaders[kind]) return res.status(404).json({ success: false, message: "Unknown catalog list" });
      return res.json({ success: true, data: await loaders[kind]() });
    } catch (error) {
      return handleError(res, error, "catalog options");
    }
  }

  /* ================= MEDIA LIBRARY ================= */
  async listMedia(req, res) {
    try {
      const source = ["upload", "product", "service", "service_banner", "category"].includes(req.query.source) ? req.query.source : null;
      const language = ["en", "hi", "mr", "neutral"].includes(req.query.language) ? req.query.language : null;
      return res.json({ success: true, data: await MediaModel.listMedia({ source, language, page: req.query.page, limit: req.query.limit }) });
    } catch (error) {
      return handleError(res, error, "list media");
    }
  }

  async storeMedia(req, buffer, { source, sourceRefId = null, label = null, declaredMime = null }) {
    const image = await normalizeNotificationImage(buffer, { declaredMime });
    const key = notificationStorageKey();
    await uploadToR2(image.buffer, key, image.mimeType);
    const language = ["en", "hi", "mr"].includes(req.body?.language) ? req.body.language : null;
    const media = await MediaModel.insertMedia({
      source,
      source_ref_id: sourceRefId,
      label: label ? String(label).slice(0, 150) : null,
      language,
      storage_key: key,
      public_url: getPublicUrl(key),
      mime_type: image.mimeType,
      width: image.width,
      height: image.height,
      bytes: image.bytes,
    }, req.user);
    await CampaignModel.audit({ actor: req.user, action: "media_added", details: { media_id: media.media_id, source, source_ref_id: sourceRefId, bytes: image.bytes }, ip: req.ip });
    return media;
  }

  async uploadMedia(req, res) {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: "Choose an image file to upload." });
      const media = await this.storeMedia(req, req.file.buffer, {
        source: "upload",
        label: req.body?.label || req.file.originalname,
        declaredMime: req.file.mimetype,
      });
      return res.status(201).json({ success: true, data: media });
    } catch (error) {
      return handleError(res, error, "upload media");
    }
  }

  /** Copy an approved catalog image (product/service/banner/category) into the library. */
  async importMedia(req, res) {
    try {
      const source = req.body?.source;
      const id = positiveInt(req.body?.id);
      if (!["product", "service", "service_banner", "category"].includes(source) || !id) {
        return res.status(400).json({ success: false, message: "Choose a product, service, banner or category image." });
      }
      const sourceUrl = await MediaModel.sourceImage(source, id);
      if (!sourceUrl) return res.status(404).json({ success: false, message: "That item has no available image, or is not published." });
      const buffer = await fetchAllowedImage(sourceUrl.split("?")[0]);
      const media = await this.storeMedia(req, buffer, { source, sourceRefId: String(id), label: req.body?.label });
      return res.status(201).json({ success: true, data: media });
    } catch (error) {
      return handleError(res, error, "import media");
    }
  }

  async archiveMedia(req, res) {
    try {
      const mediaId = positiveInt(req.params.id);
      const media = mediaId ? await MediaModel.findById(mediaId) : null;
      if (!media) return res.status(404).json({ success: false, message: "Image not found" });
      // Archiving stops future use; scheduled campaigns using it fall back to text and are flagged.
      if (!isAdmin(req.user) && Number(media.created_by) !== Number(req.user.user_id)) {
        return deny(req, res, { action: "media_archive", reason: "Only an admin or the uploader can archive this image." });
      }
      await MediaModel.archiveMedia(mediaId);
      await CampaignModel.audit({ actor: req.user, action: "media_archived", details: { media_id: mediaId }, ip: req.ip });
      return res.json({ success: true });
    } catch (error) {
      return handleError(res, error, "archive media");
    }
  }

  async checkMedia(req, res) {
    try {
      const media = await MediaModel.findById(positiveInt(req.params.id));
      if (!media || media.status !== "active") return res.status(404).json({ success: false, message: "Image not found" });
      return res.json({ success: true, data: await checkImageAvailable(media.public_url) });
    } catch (error) {
      return handleError(res, error, "check media");
    }
  }

  /** Resolve which image each language would receive, for the composer preview. */
  async previewMedia(req, res) {
    try {
      const media = req.body?.media && typeof req.body.media === "object" ? req.body.media : {};
      const rows = await MediaModel.findActiveByIds(Object.values(media));
      const byId = new Map(rows.map((row) => [Number(row.media_id), row]));
      const campaign = { ...req.body, media, content_type: req.body?.content_type || "image" };
      const perLanguage = Object.fromEntries(["en", "hi", "mr"].map((lang) => [lang, byId.get(Number(mediaIdForLanguage(media, lang))) || null]));
      return res.json({ success: true, data: { perLanguage, warnings: mediaLanguageWarnings(campaign, byId) } });
    } catch (error) {
      return handleError(res, error, "preview media");
    }
  }
}

module.exports = new RmNotificationController();
