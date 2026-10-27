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
const { DEFAULT_TIMEZONE, toSqlUtc } = require("../utils/campaignSchedule");
const { buildCampaignPayload } = require("../../../services/Notifications/campaignWorker");

const ALLOW_SELF_APPROVAL = String(process.env.NOTIFICATION_ALLOW_SELF_APPROVAL || "").toLowerCase() === "true";
const EDITABLE_STATUSES = ["draft", "rejected", "pending_approval", "approved", "scheduled"];
const CANCELLABLE_STATUSES = ["draft", "pending_approval", "approved", "scheduled", "sending"];

const isAdmin = (user) => user?.role === "admin";
const positiveInt = (value) => (Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null);

function parseDateRange(query) {
  const valid = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : null);
  return { from: valid(query.from), to: valid(query.to) };
}

function handleError(res, error, context) {
  if (error.code === "ER_NO_SUCH_TABLE") {
    return res.status(503).json({
      success: false,
      code: "MIGRATION_REQUIRED",
      message: "Notification campaign tables are not installed yet. Apply migrations/20261027_01_create_notification_campaigns.sql.",
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

function serializeTemplate(template) {
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
    can_approve: isAdmin(user) && campaign.status === "pending_approval" &&
      (ALLOW_SELF_APPROVAL || Number(campaign.created_by) !== Number(user.user_id)),
  };
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

      return res.json({
        success: true,
        data: {
          role: req.user.role,
          modules: MODULE_OPTIONS.map(({ value, label, module, screen }) => ({ value, label, module, screen: screen || null })),
          categories: CATEGORIES,
          audienceTypes: AUDIENCE_TYPES,
          targetScreens: TARGET_SCREENS,
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
          limits: {
            promotionalDailyCap: Number(process.env.NOTIFICATION_PROMO_DAILY_CAP || 2),
            selfApproval: ALLOW_SELF_APPROVAL,
            employeeTimezone: process.env.SCHEDULE_TIMEZONE || DEFAULT_TIMEZONE,
          },
          infrastructure: { campaignTables, attemptsTable },
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
      const { from, to } = parseDateRange(req.query);
      const moduleOption = MODULE_OPTIONS.find((option) => option.value === req.query.module);

      const nWhere = [scoped.sql];
      const nParams = [...scoped.params];
      if (moduleOption) { nWhere.push("n.module = ?"); nParams.push(moduleOption.module); }
      if (from) { nWhere.push("n.created_at >= ?"); nParams.push(`${from} 00:00:00`); }
      if (to) { nWhere.push("n.created_at < DATE_ADD(?, INTERVAL 1 DAY)"); nParams.push(`${to} 00:00:00`); }

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
        if (from) { aWhere.push("a.created_at >= ?"); aParams.push(`${from} 00:00:00`); }
        if (to) { aWhere.push("a.created_at < DATE_ADD(?, INTERVAL 1 DAY)"); aParams.push(`${to} 00:00:00`); }
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
      const { from, to } = parseDateRange(req.query);
      const where = [scoped.sql];
      const params = [...scoped.params];
      const moduleOption = MODULE_OPTIONS.find((option) => option.value === req.query.module);
      const companyId = positiveInt(req.query.company_id);

      if (companyId) { where.push("c.company_id = ?"); params.push(companyId); }
      if (moduleOption) { where.push("n.module = ?"); params.push(moduleOption.module); }
      if (req.query.type && /^[a-z0-9_]{1,60}$/.test(req.query.type)) { where.push("n.type = ?"); params.push(req.query.type); }
      if (["low", "normal", "high"].includes(req.query.priority)) { where.push("n.priority = ?"); params.push(req.query.priority); }
      if (req.query.is_read === "1" || req.query.is_read === "0") { where.push("n.is_read = ?"); params.push(Number(req.query.is_read)); }
      if (from) { where.push("n.created_at >= ?"); params.push(`${from} 00:00:00`); }
      if (to) { where.push("n.created_at < DATE_ADD(?, INTERVAL 1 DAY)"); params.push(`${to} 00:00:00`); }
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
      let templates = (await loadTemplates()).map(serializeTemplate);

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
      return res.json({ success: true, data: serializeTemplate(template) });
    } catch (error) {
      return handleError(res, error, "get template");
    }
  }

  async createTemplate(req, res) {
    try {
      const body = req.body || {};
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

      const approved = isAdmin(req.user)
        ? parseApprovedLanguages(body.approved_languages).filter((lang) => value[`title_${lang}`] && value[`body_${lang}`])
        : [];

      const [result] = await db.query(
        `INSERT INTO notification_templates
         (template_key, module, trigger_description, target_audience, notification_type, priority,
          title_en, body_en, title_mr, body_mr, title_hi, body_hi, deep_link_pattern,
          source_status, localization_status, notes, is_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'dashboard_created', ?, ?, 0)`,
        [
          key, moduleOption.module,
          String(body.trigger_description || "Created in the RM Notification Manager for campaigns.").slice(0, 2000),
          String(body.target_audience || "Campaign audience").slice(0, 255),
          type, value.priority,
          value.title_en, value.body_en, value.title_mr, value.body_mr, value.title_hi, value.body_hi,
          `approved:${approved.join(",")}`,
          body.notes ? String(body.notes).slice(0, 2000) : null,
        ],
      );
      NotificationTemplateModel.clearCache();
      await CampaignModel.audit({ actor: req.user, action: "template_created", details: { template_id: result.insertId, template_key: key }, ip: req.ip });
      return res.status(201).json({ success: true, data: serializeTemplate(await loadTemplate(result.insertId)) });
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

      // Enabled templates may already drive live sends; only admins change them.
      if (!admin && Number(template.is_enabled) === 1) {
        return deny(req, res, { action: "template_update", reason: "Enabled templates can only be edited by an admin." });
      }
      const body = req.body || {};
      if (!admin && ("is_enabled" in body || "approved_languages" in body || "deep_link_pattern" in body)) {
        return deny(req, res, { action: "template_update", reason: "Only an admin can enable templates, approve translations or change deep links." });
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
      const approved = carryApprovedLanguages(previous, value, parseApprovedLanguages(body.approved_languages), admin);
      const isEnabled = admin && "is_enabled" in body ? (body.is_enabled ? 1 : 0) : Number(template.is_enabled);

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
      return res.json({ success: true, data: serializeTemplate(await loadTemplate(template.template_id)) });
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
    const { value, errors } = validateCampaignInput(req.body || {});
    let template = null;

    if (value.source === "template" && value.template_id) {
      template = await loadTemplate(value.template_id);
      if (!template) errors.push("Template not found.");
      else {
        const category = campaignCategoryForTemplate(template);
        if (!category) errors.push("This is an event template used by the system (e.g. order or payment updates) and cannot be sent as a campaign.");
        else value.category = category;
      }
    }

    const baseline = previous || (template
      ? { ...template, approved_languages: [...approvedLanguagesFor(template)].join(",") }
      : { approved_languages: "" });
    value.approved_languages = carryApprovedLanguages(baseline, value, value.approved_languages, isAdmin(req.user));
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
      const [summary, audit] = await Promise.all([
        CampaignModel.recipientSummary(campaign.campaign_id),
        CampaignModel.auditTrail(campaign.campaign_id),
      ]);
      return res.json({ success: true, data: { ...serializeCampaign(campaign, req.user), summary, audit } });
    } catch (error) {
      return handleError(res, error, "get campaign");
    }
  }

  async createCampaign(req, res) {
    try {
      const { value, errors } = await this.buildCampaignValues(req);
      if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

      const scope = await AudienceModel.getScope(req.user);
      const permission = checkAudiencePermission(value.audience_type, value.audience_filter, scope);
      if (!permission.allowed) return deny(req, res, { action: "create", reason: permission.reason });

      value.estimated_recipients = (await AudienceModel.preview(value.audience_type, value.audience_filter, scope)).total;
      const campaignId = await CampaignModel.create(value, req.user);
      await CampaignModel.audit({ campaignId, actor: req.user, action: "created", details: { audience_type: value.audience_type }, ip: req.ip });
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
      if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

      const scope = await AudienceModel.getScope(req.user);
      const permission = checkAudiencePermission(value.audience_type, value.audience_filter, scope);
      if (!permission.allowed) return deny(req, res, { action: "update", campaignId: campaign.campaign_id, reason: permission.reason });

      value.estimated_recipients = (await AudienceModel.preview(value.audience_type, value.audience_filter, scope)).total;
      const updated = await CampaignModel.update(campaign.campaign_id, value, req.user, EDITABLE_STATUSES);
      if (!updated) return res.status(409).json({ success: false, message: "The campaign changed while you were editing. Reload and try again." });

      // Any edit after submission needs a fresh approval and schedule.
      if (campaign.status !== "draft") {
        await CampaignModel.transition(campaign.campaign_id, EDITABLE_STATUSES, "draft", {
          approved_by: null, approved_at: null, submitted_at: null, next_run_at: null, rejection_reason: null,
        });
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
      const results = [];
      for (const user of targets) {
        let rendered;
        try {
          rendered = renderCampaignForRecipient(campaign, { language: forcedLanguage || user.language, firstName: String(user.name || "").split(/\s+/)[0] });
        } catch (error) {
          if (!(error instanceof TemplateRenderError)) throw error;
          return res.status(400).json({ success: false, message: error.message });
        }
        const payload = buildCampaignPayload(campaign, { user_id: user.user_id, occurrence_no: 0 }, rendered);
        payload.idempotency_key = `campaign-test:${campaign.campaign_id}:${user.user_id}:${Date.now()}`;
        payload.title = `[TEST] ${payload.title}`.slice(0, 255);
        payload.metadata = { ...payload.metadata, test: true };

        const outcome = await deliverNotification(payload);
        results.push({
          user_id: user.user_id,
          name: user.name,
          language: rendered.language,
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

  async submitCampaign(req, res) {
    try {
      const campaign = await this.loadManaged(req, res, "submit");
      if (!campaign) return undefined;
      if (!["draft", "rejected"].includes(campaign.status)) {
        return res.status(409).json({ success: false, message: "Only drafts can be submitted for approval." });
      }

      const errors = validateForSubmission(campaign);
      if (campaign.source === "template") {
        const template = await loadTemplate(campaign.template_id);
        if (!template || Number(template.is_enabled) !== 1) errors.push("The selected template is disabled. An admin must enable it first.");
      }
      if (errors.length) return res.status(400).json({ success: false, message: errors[0], errors });

      const scope = await AudienceModel.getScope(req.user);
      const permission = checkAudiencePermission(campaign.audience_type, campaign.audience_filter, scope);
      if (!permission.allowed) return deny(req, res, { action: "submit", campaignId: campaign.campaign_id, reason: permission.reason });

      const preview = await AudienceModel.preview(campaign.audience_type, campaign.audience_filter, scope);
      if (!preview.total) return res.status(400).json({ success: false, message: "The selected audience has no active employees." });

      await CampaignModel.transition(campaign.campaign_id, ["draft", "rejected"], "pending_approval", {
        submitted_at: new Date(), estimated_recipients: preview.total, rejection_reason: null,
      });
      await CampaignModel.audit({ campaignId: campaign.campaign_id, actor: req.user, action: "submitted", details: { estimated_recipients: preview.total }, ip: req.ip });
      return res.json({ success: true, data: serializeCampaign(await CampaignModel.findById(campaign.campaign_id), req.user) });
    } catch (error) {
      return handleError(res, error, "submit campaign");
    }
  }

  async approveCampaign(req, res) {
    try {
      const campaign = await CampaignModel.findById(positiveInt(req.params.id));
      if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });
      if (!isAdmin(req.user)) return deny(req, res, { action: "approve", campaignId: campaign.campaign_id, reason: "Only an admin can approve campaigns." });
      if (campaign.status !== "pending_approval") return res.status(409).json({ success: false, message: "Only campaigns awaiting approval can be approved." });
      if (!ALLOW_SELF_APPROVAL && Number(campaign.created_by) === Number(req.user.user_id)) {
        return deny(req, res, { action: "approve", campaignId: campaign.campaign_id, reason: "A campaign must be approved by someone other than its creator." });
      }
      if (campaign.source === "template") {
        const template = await loadTemplate(campaign.template_id);
        if (!template || Number(template.is_enabled) !== 1) return res.status(400).json({ success: false, message: "The template is disabled. Enable it before approving." });
      }

      // The creator's scope, not the approver's, bounds the audience.
      const [[creator]] = await db.query("SELECT user_id, role FROM eusers WHERE user_id = ?", [campaign.created_by]);
      const permission = checkAudiencePermission(campaign.audience_type, campaign.audience_filter, await AudienceModel.getScope(creator || {}));
      if (!permission.allowed) return deny(req, res, { action: "approve", campaignId: campaign.campaign_id, reason: `Creator scope check failed: ${permission.reason}` });

      const approvedLanguages = parseApprovedLanguages(req.body?.approved_languages ?? campaign.approved_languages)
        .filter((lang) => campaign[`title_${lang}`] && campaign[`body_${lang}`]).join(",");

      const moved = await CampaignModel.transition(campaign.campaign_id, ["pending_approval"], "approved", {
        approved_by: req.user.user_id, approved_at: new Date(), approved_languages: approvedLanguages,
      });
      if (!moved) return res.status(409).json({ success: false, message: "The campaign changed. Reload and try again." });
      await CampaignModel.audit({ campaignId: campaign.campaign_id, actor: req.user, action: "approved", details: { approved_languages: approvedLanguages }, ip: req.ip });
      return res.json({ success: true, data: serializeCampaign(await CampaignModel.findById(campaign.campaign_id), req.user) });
    } catch (error) {
      return handleError(res, error, "approve campaign");
    }
  }

  async rejectCampaign(req, res) {
    try {
      const campaign = await CampaignModel.findById(positiveInt(req.params.id));
      if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });
      if (!isAdmin(req.user)) return deny(req, res, { action: "reject", campaignId: campaign.campaign_id, reason: "Only an admin can reject campaigns." });
      const reason = String(req.body?.reason || "").trim().slice(0, 500);
      if (!reason) return res.status(400).json({ success: false, message: "Give a reason so the creator can fix the campaign." });

      const moved = await CampaignModel.transition(campaign.campaign_id, ["pending_approval"], "rejected", { rejection_reason: reason });
      if (!moved) return res.status(409).json({ success: false, message: "Only campaigns awaiting approval can be rejected." });
      await CampaignModel.audit({ campaignId: campaign.campaign_id, actor: req.user, action: "rejected", details: { reason }, ip: req.ip });
      return res.json({ success: true, data: serializeCampaign(await CampaignModel.findById(campaign.campaign_id), req.user) });
    } catch (error) {
      return handleError(res, error, "reject campaign");
    }
  }

  /** Queue an approved campaign; also reschedules one that has not started. */
  async scheduleCampaign(req, res) {
    try {
      const campaign = await this.loadManaged(req, res, "schedule");
      if (!campaign) return undefined;
      const reschedulable = campaign.status === "scheduled" && Number(campaign.occurrences_started) === 0;
      if (campaign.status !== "approved" && !reschedulable) {
        return res.status(409).json({ success: false, message: "Only approved campaigns that have not started can be scheduled." });
      }

      const now = new Date();
      let scheduledAt = campaign.scheduled_at;
      let timezone = campaign.timezone;
      if (req.body?.send_date || req.body?.send_time) {
        const { value, errors } = validateCampaignInput({ ...campaign, name: campaign.name, module: MODULE_OPTIONS.find((option) => option.module === campaign.module)?.value, ...req.body, delivery_mode: campaign.delivery_mode });
        const timeErrors = errors.filter((error) => /date|time|Expiry/i.test(error));
        if (timeErrors.length) return res.status(400).json({ success: false, message: timeErrors[0] });
        scheduledAt = value.scheduled_at;
        timezone = value.timezone;
      }

      const nextRunAt = campaign.delivery_mode === "now" ? now : scheduledAt;
      if (!nextRunAt) return res.status(400).json({ success: false, message: "Choose a send date and time." });
      if (campaign.delivery_mode !== "now" && nextRunAt <= now) return res.status(400).json({ success: false, message: "The send time is in the past." });
      if (campaign.expires_at && nextRunAt >= campaign.expires_at) return res.status(400).json({ success: false, message: "The campaign expires before it would be sent." });

      const moved = await CampaignModel.transition(campaign.campaign_id, ["approved", "scheduled"], "scheduled", {
        scheduled_at: campaign.delivery_mode === "now" ? now : scheduledAt, timezone, next_run_at: nextRunAt,
      });
      if (!moved) return res.status(409).json({ success: false, message: "The campaign changed. Reload and try again." });
      await CampaignModel.audit({ campaignId: campaign.campaign_id, actor: req.user, action: "scheduled", details: { next_run_at: toSqlUtc(nextRunAt), timezone }, ip: req.ip });
      return res.json({ success: true, data: serializeCampaign(await CampaignModel.findById(campaign.campaign_id), req.user) });
    } catch (error) {
      return handleError(res, error, "schedule campaign");
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
      const status = ["pending", "processing", "sent", "failed", "skipped", "cancelled"].includes(req.query.status) ? req.query.status : null;
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
      const { from, to } = parseDateRange(req.query);
      const visible = CampaignModel.visibilityFilter(req.user);
      const where = [visible.sql];
      const params = [...visible.params];
      if (from) { where.push("r.created_at >= ?"); params.push(`${from} 00:00:00`); }
      if (to) { where.push("r.created_at < DATE_ADD(?, INTERVAL 1 DAY)"); params.push(`${to} 00:00:00`); }

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
      const [byDay] = await db.query(
        `SELECT DATE(r.updated_at) AS day, SUM(r.status = 'sent') AS sent, SUM(r.devices_accepted > 0) AS firebase_accepted, SUM(r.status = 'failed') AS failed
         FROM notification_campaign_recipients r JOIN notification_campaigns nc ON nc.campaign_id = r.campaign_id
         WHERE ${where.join(" AND ")} GROUP BY DATE(r.updated_at) ORDER BY day DESC LIMIT 31`,
        params,
      );

      const n = (rows) => rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" && /^\d+$/.test(value) && key !== "day" ? Number(value) : value])));
      return res.json({ success: true, data: { byModule: n(byModule), byLanguage: n(byLanguage), skipReasons: n(skipReasons), byDay: n(byDay) } });
    } catch (error) {
      return handleError(res, error, "analytics");
    }
  }
}

module.exports = new RmNotificationController();
