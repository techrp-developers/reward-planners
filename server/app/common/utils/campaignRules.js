// Pure validation and authorisation rules for RM notification campaigns.
// Database access lives in the model/controller; everything here is testable.

const { SCREEN_BY_MODULE } = require("./notificationPayload");
const {
  SUPPORTED_LANGUAGES,
  TemplateRenderError,
  approvedLanguagesFor,
  listPlaceholders,
  renderText,
  resolveLanguage,
  resolveModule,
} = require("./notificationTemplate");
const { DEFAULT_TIMEZONE, isValidTimezone, localToUtc } = require("./campaignSchedule");
const { validateDestination } = require("./notificationDestinations");

const CONTENT_TYPES = ["standard", "image", "catalog"];
const MEDIA_SLOTS = ["default", "en", "hi", "mr"];
const MAX_CATALOG_PRODUCTS = 20;

// Dashboard module options -> notifications.module values the backend already
// writes. "Support" has no module of its own (support events are stored as
// "common"), so it is offered as common + the Support screen, not renamed.
const MODULE_OPTIONS = [
  { value: "common", label: "Common / General", module: "common" },
  { value: "ecommerce", label: "Products & E-commerce", module: "ecommerce" },
  { value: "service", label: "Services", module: "service" },
  { value: "bbps", label: "BBPS / Payments", module: "bbps" },
  { value: "busbooking", label: "Bus Booking", module: "busbooking" },
  { value: "fitness", label: "RP Move / Fitness", module: "fitness" },
  { value: "games", label: "Games / Quiz", module: "games" },
  { value: "todo", label: "To-do", module: "todo" },
  { value: "wallet", label: "Wallet / Rewards", module: "wallet" },
  { value: "birthday", label: "Birthday", module: "birthday" },
  { value: "chat", label: "Chat / Community", module: "chat" },
  { value: "support", label: "Support", module: "common", screen: "Support" },
];
const MODULE_BY_VALUE = Object.fromEntries(MODULE_OPTIONS.map((option) => [option.value, option]));

// Registered mobile screens a campaign may open. Free-form URLs and rp://
// links are never accepted from the dashboard.
const TARGET_SCREENS = [...new Set([
  ...Object.values(SCREEN_BY_MODULE),
  "Support", "Profile", "Cart", "OrderDetails", "ServiceOrderDetails",
])];
const SCREENS_REQUIRING_REFERENCE = new Set(["OrderDetails", "ServiceOrderDetails"]);

const CATEGORIES = ["marketing", "engagement", "announcement"];
const PRIORITIES = ["low", "normal", "high"];
const AUDIENCE_TYPES = ["test", "individual", "selected", "company", "assigned_companies", "module_users", "all_companies"];
const DELIVERY_MODES = ["now", "once", "recurring"];
const RECURRENCE_TYPES = ["none", "daily", "weekly", "monthly"];
const MAX_SELECTED_USERS = 500;
const MAX_COMPANIES = 50;

// Per-recipient values the dispatcher fills in; everything else must be a
// campaign-level variable supplied by the RM.
const RECIPIENT_PLACEHOLDERS = new Set(["first_name"]);

// Transactional catalog templates describe backend events (order paid, OTP,
// refunds). Campaigns must not impersonate them; only these may be reused.
const ANNOUNCEMENT_TEMPLATE_KEYS = new Set(["hr_announcement"]);

// "Announcement" skips marketing consent, so it is limited to genuine
// organisational information. Anything selling something is marketing.
const ANNOUNCEMENT_TYPES = {
  company_update: "Company update",
  hr_policy: "HR / policy",
  event: "Event or holiday",
  service_disruption: "Service disruption",
  system_maintenance: "App maintenance",
  safety_notice: "Safety notice",
};
const ANNOUNCEMENT_DESTINATIONS = new Set(["home", "notifications", "announcements", "events", "support"]);
// (\b does not match before "₹", so the currency sign is matched on its own.)
const PROMOTIONAL_WORDING = /(\d+\s*%\s*off|\bdiscount|\boffers?\b|\bsale\b|\bcoupon|\bcashback|\bbuy now\b|\bshop now\b|\bdeals?\b|(?:\brs\.?|\binr|₹)\s*\d)/i;

/**
 * Announcement guard. Returns error strings; empty when the content is a
 * permissible announcement.
 */
function validateAnnouncement(value) {
  if (value.category !== "announcement") return [];
  const errors = [];
  if (!ANNOUNCEMENT_TYPES[value.announcement_type]) errors.push("Choose the announcement type (company update, HR/policy, event, disruption, maintenance or safety).");
  if (value.module !== "common") errors.push("Announcements use the Common / General or Support module. Module promotions must be sent as Marketing.");
  if (value.content_type === "catalog") errors.push("Product catalogs are promotions: send them as Marketing.");
  if (value.destination_type && !ANNOUNCEMENT_DESTINATIONS.has(value.destination_type)) {
    errors.push("Announcements may only open Home, Announcements, Events, Support or the inbox.");
  }
  const text = ["title_en", "body_en", "title_hi", "body_hi", "title_mr", "body_mr"].map((key) => value[key] || "").join(" ");
  if (PROMOTIONAL_WORDING.test(text)) {
    errors.push("This text reads like a promotion (offers, discounts, prices). Send it as Marketing so employee consent applies.");
  }
  return errors;
}

/**
 * notifications.send: role-based (there is no permission table). Admins and
 * RMs may send; NOTIFICATION_RM_SEND_ENABLED=false switches RM sending off.
 * Used by the API and again by the scheduler when a job runs.
 */
function canSendNotifications(user) {
  if (user?.role === "admin") return true;
  return user?.role === "rm" && String(process.env.NOTIFICATION_RM_SEND_ENABLED ?? "true").toLowerCase() !== "false";
}

function campaignCategoryForTemplate(template) {
  if (["marketing", "engagement"].includes(template.notification_type)) return template.notification_type;
  if (ANNOUNCEMENT_TEMPLATE_KEYS.has(template.template_key)) return "announcement";
  return null;
}

function moduleOptionForTemplate(template) {
  const backendModule = resolveModule(template);
  return MODULE_OPTIONS.find((option) => option.module === backendModule && !option.screen)?.value || "common";
}

function cleanText(value, max) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

function toIdList(value, max) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))].slice(0, max);
}

function parseApprovedLanguages(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(list.map((item) => String(item).trim()).filter((lang) => lang === "hi" || lang === "mr"))];
}

/**
 * Normalise a create/update body. Returns { value, errors }. Unknown fields are
 * dropped; nothing here touches the database.
 */
function validateCampaignInput(body = {}) {
  const errors = [];
  const value = {};

  value.name = cleanText(body.name, 150);
  if (!value.name) errors.push("Campaign name is required.");

  value.source = body.source === "template" ? "template" : "manual";
  value.template_id = value.source === "template" ? Number(body.template_id) || null : null;
  if (value.source === "template" && !value.template_id) errors.push("Select a template.");

  const moduleOption = MODULE_BY_VALUE[body.module];
  if (!moduleOption) errors.push("Select a valid module.");
  value.module_option = moduleOption?.value || null;
  value.module = moduleOption?.module || null;

  value.category = CATEGORIES.includes(body.category) ? body.category : null;
  if (!value.category) errors.push("Select a notification category.");
  value.announcement_type = value.category === "announcement" && ANNOUNCEMENT_TYPES[body.announcement_type] ? body.announcement_type : null;
  value.priority = PRIORITIES.includes(body.priority) ? body.priority : "normal";

  value.title_en = cleanText(body.title_en, 255);
  value.body_en = cleanText(body.body_en, 1000);
  if (!value.title_en || !value.body_en) errors.push("English title and message are required.");
  for (const lang of ["hi", "mr"]) {
    value[`title_${lang}`] = cleanText(body[`title_${lang}`], 255) || null;
    value[`body_${lang}`] = cleanText(body[`body_${lang}`], 1000) || null;
    if (Boolean(value[`title_${lang}`]) !== Boolean(value[`body_${lang}`])) {
      errors.push(`${lang === "hi" ? "Hindi" : "Marathi"} needs both a title and a message, or neither.`);
    }
  }

  const variables = body.variables && typeof body.variables === "object" && !Array.isArray(body.variables) ? body.variables : {};
  value.variables = Object.fromEntries(Object.entries(variables)
    .filter(([key]) => /^[a-z0-9_]{1,40}$/i.test(key) && !RECIPIENT_PLACEHOLDERS.has(key))
    .slice(0, 20)
    .map(([key, item]) => [key, cleanText(item, 200)]));

  value.target_screen = body.target_screen ? String(body.target_screen) : moduleOption?.screen || null;
  if (value.target_screen && !TARGET_SCREENS.includes(value.target_screen) && !body.destination_type && body.content_type !== "catalog") {
    errors.push("Target screen is not an available app screen.");
  }
  value.reference_type = cleanText(body.reference_type, 30) || null;
  value.reference_id = cleanText(body.reference_id, 64) || null;
  if (value.reference_type && !/^[a-z_]+$/.test(value.reference_type)) errors.push("Reference type is invalid.");
  if (value.reference_id && !/^[A-Za-z0-9_-]+$/.test(value.reference_id)) errors.push("Reference ID is invalid.");
  if (SCREENS_REQUIRING_REFERENCE.has(value.target_screen) && !value.reference_id) {
    errors.push(`${value.target_screen} needs a reference ID.`);
  }

  // Rich content. Images are referenced by notification_media ids only: the
  // URL is resolved from the approved library at send time, never typed in.
  value.content_type = CONTENT_TYPES.includes(body.content_type) ? body.content_type : "standard";
  const media = body.media && typeof body.media === "object" && !Array.isArray(body.media) ? body.media : {};
  value.media = value.content_type === "standard" ? null : Object.fromEntries(MEDIA_SLOTS
    .map((slot) => [slot, Number(media[slot])])
    .filter(([, id]) => Number.isSafeInteger(id) && id > 0));
  if (value.content_type !== "standard" && !value.media.default && !value.media.en) {
    errors.push("Add an image (a default image, or one for English).");
  }
  value.image_url = null;

  value.catalog_product_ids = value.content_type === "catalog" ? toIdList(body.catalog_product_ids, MAX_CATALOG_PRODUCTS) : null;
  value.destination_type = body.destination_type ? String(body.destination_type) : null;
  value.destination_id = body.destination_id == null || body.destination_id === "" ? null : cleanText(body.destination_id, 64);
  if (value.content_type === "catalog") {
    if (value.module !== "ecommerce") errors.push("Product catalog notifications belong to the Products & E-commerce module.");
    if (!value.catalog_product_ids.length) errors.push("Select at least one product.");
    // One product opens its page; several open the collection screen.
    value.destination_type = value.catalog_product_ids.length === 1 ? "product" : "product_collection";
    value.destination_id = value.catalog_product_ids.length === 1 ? String(value.catalog_product_ids[0]) : null;
  }
  if (value.destination_type) {
    const { destination, errors: destinationErrors } = validateDestination({
      module: value.module,
      destinationType: value.destination_type,
      destinationId: value.destination_id,
      productIds: value.catalog_product_ids || [],
    });
    errors.push(...destinationErrors);
    if (destination) {
      value.target_screen = destination.screen;
      if (!destination.entity || destination.entity === "product_list" || destination.entity === "published_quiz") value.destination_id = null;
    }
  }

  value.audience_type = AUDIENCE_TYPES.includes(body.audience_type) ? body.audience_type : "test";
  const filter = body.audience_filter && typeof body.audience_filter === "object" ? body.audience_filter : {};
  value.audience_filter = {
    user_ids: toIdList(filter.user_ids, MAX_SELECTED_USERS),
    company_ids: toIdList(filter.company_ids, MAX_COMPANIES),
    module: MODULE_BY_VALUE[filter.module]?.module || null,
  };
  if (["individual"].includes(value.audience_type) && value.audience_filter.user_ids.length !== 1) {
    errors.push("Select exactly one employee.");
  }
  if (value.audience_type === "selected" && !value.audience_filter.user_ids.length) errors.push("Select at least one employee.");
  if (value.audience_type === "company" && !value.audience_filter.company_ids.length) errors.push("Select at least one company.");
  if (value.audience_type === "module_users" && !value.audience_filter.module) errors.push("Select the module whose users to target.");

  value.delivery_mode = DELIVERY_MODES.includes(body.delivery_mode) ? body.delivery_mode : "once";
  value.timezone = isValidTimezone(body.timezone) ? body.timezone : DEFAULT_TIMEZONE;
  value.recurrence_type = value.delivery_mode === "recurring" && RECURRENCE_TYPES.includes(body.recurrence_type) && body.recurrence_type !== "none"
    ? body.recurrence_type
    : "none";
  if (value.delivery_mode === "recurring" && value.recurrence_type === "none") errors.push("Choose daily, weekly or monthly recurrence.");

  value.scheduled_at = null;
  if (value.delivery_mode !== "now" && (body.send_date || body.send_time)) {
    value.scheduled_at = localToUtc(body.send_date, body.send_time, value.timezone);
    if (!value.scheduled_at) errors.push("Send date/time is invalid.");
  }
  value.recurrence_end_at = null;
  if (value.recurrence_type !== "none" && body.end_date) {
    value.recurrence_end_at = localToUtc(body.end_date, "23:59", value.timezone);
    if (!value.recurrence_end_at) errors.push("End date is invalid.");
  }
  value.max_occurrences = value.recurrence_type !== "none" && Number(body.max_occurrences) > 0
    ? Math.min(Math.floor(Number(body.max_occurrences)), 365)
    : null;
  value.expires_at = null;
  if (body.expiry_date) {
    value.expires_at = localToUtc(body.expiry_date, body.expiry_time || "23:59", value.timezone);
    if (!value.expires_at) errors.push("Expiry date is invalid.");
  }
  if (value.scheduled_at && value.expires_at && value.expires_at <= value.scheduled_at) {
    errors.push("Expiry must be after the send time.");
  }

  value.approved_languages = parseApprovedLanguages(body.approved_languages);
  errors.push(...validateAnnouncement(value));
  return { value, errors };
}

/**
 * Additional checks before a campaign may leave draft: a send time for
 * scheduled modes, and every placeholder resolvable for every recipient.
 */
function validateForSubmission(campaign, now = new Date()) {
  const errors = [];
  if (campaign.delivery_mode !== "now" && !campaign.scheduled_at) errors.push("Choose a send date and time.");
  if (campaign.delivery_mode !== "now" && campaign.scheduled_at && campaign.scheduled_at <= now) {
    errors.push("The send time is in the past.");
  }
  if (campaign.audience_type === "test") errors.push("Test-only campaigns are sent with Send Test, not submitted for approval.");

  const sample = { ...(campaign.variables || {}), first_name: "Employee" };
  for (const lang of ["en", "hi", "mr"]) {
    for (const field of ["title", "body"]) {
      const text = campaign[`${field}_${lang}`];
      if (!text) continue;
      try {
        renderText(text, sample);
      } catch (error) {
        if (!(error instanceof TemplateRenderError)) throw error;
        errors.push(`${lang.toUpperCase()} ${field}: ${error.message}`);
      }
    }
  }
  return errors;
}

/**
 * Backend-enforced audience permission. `scope` comes from the database:
 * admins are global; RMs only reach companies in rm_company_assignments.
 */
function checkAudiencePermission(audienceType, filter, scope) {
  if (audienceType === "test") return { allowed: true };
  if (audienceType === "all_companies") {
    return scope.global ? { allowed: true } : { allowed: false, reason: "Only an admin can target every company." };
  }
  if (scope.global) {
    return audienceType === "assigned_companies"
      ? { allowed: false, reason: "Admins have no assigned companies; choose companies or all companies." }
      : { allowed: true };
  }
  if (!scope.companyIds.length) {
    return {
      allowed: false,
      reason: scope.assignmentsAvailable
        ? "No companies are assigned to you yet, so only test sends are available."
        : "RM company assignments are not configured yet, so only test sends are available.",
    };
  }
  const outside = (filter.company_ids || []).filter((id) => !scope.companyIds.includes(id));
  if (outside.length) return { allowed: false, reason: "One or more selected companies are not assigned to you." };
  return { allowed: true };
}

/** Render one campaign for one recipient in their approved language. */
function renderCampaignForRecipient(campaign, { language, firstName }) {
  const resolved = resolveLanguage(campaign, language);
  const variables = { ...(campaign.variables || {}), first_name: firstName || "there" };
  return {
    language: resolved,
    title: renderText(campaign[`title_${resolved}`], variables).slice(0, 255),
    message: renderText(campaign[`body_${resolved}`], variables).slice(0, 1000),
  };
}

function campaignPlaceholders(campaign) {
  const names = new Set();
  for (const lang of ["en", "hi", "mr"]) {
    for (const field of ["title", "body"]) listPlaceholders(campaign[`${field}_${lang}`]).forEach((name) => names.add(name));
  }
  return [...names];
}

/** The image a recipient in `language` receives: localized, else default. */
function mediaIdForLanguage(media, language) {
  if (!media) return null;
  return media[language] || media.default || media.en || null;
}

/**
 * Warn when a language would receive an image whose built-in text is in a
 * different language (e.g. an English banner on a Marathi notification).
 */
function mediaLanguageWarnings(campaign, mediaById) {
  if (!campaign.media || campaign.content_type === "standard") return [];
  const approved = new Set(parseApprovedLanguages(campaign.approved_languages));
  const warnings = [];
  for (const language of ["en", "hi", "mr"]) {
    if (language !== "en" && !(approved.has(language) && campaign[`title_${language}`])) continue;
    const media = mediaById.get(Number(mediaIdForLanguage(campaign.media, language)));
    if (!media) {
      warnings.push(`The image for ${language.toUpperCase()} recipients is missing or archived.`);
    } else if (media.language && media.language !== language) {
      warnings.push(`${language.toUpperCase()} recipients will see an image containing ${media.language.toUpperCase()} text. Add a ${language.toUpperCase()} image or use a language-neutral one.`);
    }
  }
  return warnings;
}

/**
 * Translation approvals survive an edit only when that language's text is
 * unchanged, so an approved translation can never be silently replaced.
 */
function carryApprovedLanguages(previous, next, requestedApprovals, canApprove) {
  const kept = [...approvedLanguagesFor({ approved_languages: previous.approved_languages || "" })]
    .filter((lang) => previous[`title_${lang}`] === next[`title_${lang}`] && previous[`body_${lang}`] === next[`body_${lang}`]);
  const added = canApprove ? requestedApprovals.filter((lang) => next[`title_${lang}`] && next[`body_${lang}`]) : [];
  return [...new Set([...kept, ...added])].filter((lang) => SUPPORTED_LANGUAGES.has(lang)).sort().join(",");
}

module.exports = {
  ANNOUNCEMENT_TYPES,
  AUDIENCE_TYPES,
  CATEGORIES,
  CONTENT_TYPES,
  canSendNotifications,
  validateAnnouncement,
  mediaIdForLanguage,
  mediaLanguageWarnings,
  MODULE_OPTIONS,
  RECIPIENT_PLACEHOLDERS,
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
};
