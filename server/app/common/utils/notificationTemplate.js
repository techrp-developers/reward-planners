// Pure rendering for notification_templates rows. No database or Firebase
// access here, so the rules below are unit-testable in isolation.

const SUPPORTED_LANGUAGES = new Set(["en", "hi", "mr"]);

// Catalog module names -> notifications.module values already used in code.
const MODULE_MAP = {
  product: "ecommerce",
  services: "service",
  move: "fitness",
  rewards: "wallet",
  bus: "busbooking",
  engagement: "common",
};

// "community" spans several existing modules, so it is resolved per template.
const TEMPLATE_MODULE_OVERRIDES = {
  chat_message: "chat",
  birthday_colleague: "birthday",
  hr_announcement: "common",
};

// Only templates whose meaning matches an event the backend already emits are
// mapped, so inbox history and mobile handling stay consistent. Everything
// else uses its template_key as the type.
const TEMPLATE_EVENT_TYPES = {
  todo_15_min: "todo_reminder",
  todo_custom: "todo_reminder",
  order_confirmed: "order_paid",
  order_dispatched: "order_shipped",
  order_out_for_delivery: "order_out_for_delivery",
  order_delivered: "delivery",
  coins_credited: "wallet_credit",
  service_order_confirmed: "service_order_paid",
  service_docs_submitted: "service_documents_submitted",
  service_enquiry_received: "service_enquiry_submitted",
  service_bundle_suggestion: "service_bundle_upsell",
  cart_abandoned: "cart_abandonment",
  price_drop: "cart_price_drop",
  low_stock: "cart_low_stock",
  midday_step_nudge: "fitness_midday_hook",
  step_near_goal: "fitness_almost_completed",
  chat_message: "chat_message",
  birthday_colleague: "coworker_birthday",
};

const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
const MAX_VALUE_LENGTH = 200;

class TemplateRenderError extends Error {
  constructor(message, missing = []) {
    super(message);
    this.name = "TemplateRenderError";
    this.missing = missing;
  }
}

function listPlaceholders(text) {
  return [...String(text || "").matchAll(PLACEHOLDER)].map((match) => match[1]);
}

function sanitizeValue(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, MAX_VALUE_LENGTH);
}

function renderText(text, variables = {}) {
  const missing = listPlaceholders(text).filter((name) => {
    const value = variables[name];
    return value === undefined || value === null || value === "" ||
      !["string", "number"].includes(typeof value);
  });

  if (missing.length) {
    throw new TemplateRenderError(
      `Missing template values: ${[...new Set(missing)].join(", ")}`,
      [...new Set(missing)],
    );
  }

  return String(text).replace(PLACEHOLDER, (_, name) => sanitizeValue(variables[name]));
}

function hasText(value) {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Reviewed translations, from the most specific source available:
 *  - `approved_languages` (campaign rows: "hi,mr" string or array)
 *  - localization_status "approved:hi,mr" (written by the dashboard review)
 *  - legacy statuses: anything containing "draft" approves nothing, any other
 *    value (e.g. "en_mr_hi_approved") approves every language present.
 */
function approvedLanguagesFor(template) {
  const explicit = template.approved_languages;
  if (explicit !== undefined && explicit !== null) {
    const list = Array.isArray(explicit) ? explicit : String(explicit).split(",");
    return new Set(list.map((value) => String(value).trim()).filter((value) => SUPPORTED_LANGUAGES.has(value)));
  }

  const status = String(template.localization_status || "");
  const scoped = /^approved:(.*)$/i.exec(status);
  if (scoped) {
    return new Set(scoped[1].split(",").map((value) => value.trim()).filter((value) => SUPPORTED_LANGUAGES.has(value)));
  }
  return /draft/i.test(status) ? new Set() : new Set(["hi", "mr"]);
}

/**
 * The employee's language is used only when that translation exists and has
 * been reviewed; otherwise the approved English text is sent.
 */
function resolveLanguage(template, requested) {
  const language = SUPPORTED_LANGUAGES.has(requested) ? requested : "en";
  if (language === "en") return "en";

  return approvedLanguagesFor(template).has(language) &&
    hasText(template[`title_${language}`]) && hasText(template[`body_${language}`])
    ? language
    : "en";
}

function resolveModule(template) {
  return TEMPLATE_MODULE_OVERRIDES[template.template_key] ||
    MODULE_MAP[template.module] ||
    template.module;
}

/**
 * Build a notifyUser() payload from a template row. Throws TemplateRenderError
 * when a required placeholder value is missing, so nothing half-rendered such
 * as "Order #{{order_id}}" is ever stored or pushed.
 */
function buildTemplateNotification(template, options = {}) {
  const { variables = {}, language: requestedLanguage, metadata } = options;
  const language = resolveLanguage(template, requestedLanguage);

  const title = renderText(template[`title_${language}`], variables).slice(0, 255);
  const message = renderText(template[`body_${language}`], variables).slice(0, 1000);

  // rp:// links are not handled by the mobile app yet; keep the rendered link
  // in metadata for when linking exists, and leave navigation to `screen`.
  let deepLink = null;
  if (template.deep_link_pattern) {
    try {
      deepLink = renderText(template.deep_link_pattern, variables);
    } catch {
      deepLink = null;
    }
  }

  return {
    userId: options.userId ?? options.user_id,
    module: resolveModule(template),
    type: options.type || TEMPLATE_EVENT_TYPES[template.template_key] || template.template_key,
    title,
    message,
    icon: options.icon,
    priority: ["low", "normal", "high"].includes(template.priority) ? template.priority : "normal",
    reference_type: options.reference_type,
    reference_id: options.reference_id,
    action_url: options.action_url,
    screen: options.screen,
    idempotency_key: options.idempotency_key,
    metadata: {
      ...(metadata && typeof metadata === "object" ? metadata : {}),
      template_key: template.template_key,
      category: template.notification_type,
      language,
      ...(deepLink ? { deep_link: deepLink } : {}),
    },
  };
}

function toMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// Handles windows that cross midnight, e.g. 21:00-08:00.
function isWithinQuietHours(start, end, nowMinutes) {
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from === null || to === null || from === to) return false;
  return from < to
    ? nowMinutes >= from && nowMinutes < to
    : nowMinutes >= from || nowMinutes < to;
}

/**
 * Transactional templates (orders, payments, reminders) and approved
 * announcements always pass. Marketing and engagement require a stored
 * preference row (no row is not consent), respect opt-outs and quiet hours,
 * and are capped per employee per day.
 */
function checkPromotionalEligibility({ category, preferences, sentToday = 0, dailyCap = 2, nowMinutes = 0 }) {
  // Announcements need no marketing consent, but they are not a way around
  // quiet hours or frequency limits.
  if (category === "announcement") {
    if (preferences && !preferences.missing &&
        isWithinQuietHours(preferences.quiet_hours_start, preferences.quiet_hours_end, nowMinutes)) {
      return { allowed: false, reason: "quiet_hours" };
    }
    if (sentToday >= dailyCap) return { allowed: false, reason: "daily_cap_reached" };
    return { allowed: true };
  }
  if (category !== "marketing" && category !== "engagement") return { allowed: true };
  if (!preferences) return { allowed: false, reason: "preferences_unavailable" };
  if (preferences.missing) return { allowed: false, reason: "no_consent_record" };

  const optedIn = category === "marketing"
    ? Number(preferences.marketing_enabled ?? 1) === 1
    : Number(preferences.engagement_enabled ?? 1) === 1;
  if (!optedIn) return { allowed: false, reason: "opted_out" };

  if (isWithinQuietHours(preferences.quiet_hours_start, preferences.quiet_hours_end, nowMinutes)) {
    return { allowed: false, reason: "quiet_hours" };
  }
  if (sentToday >= dailyCap) return { allowed: false, reason: "daily_cap_reached" };
  return { allowed: true };
}

/**
 * Validate a mobile preference update. Only fields present in the body are
 * returned, so a language change never touches consent and vice versa.
 */
function normalizePreferenceUpdate(body = {}) {
  const errors = [];
  const update = {};

  if ("language" in body) {
    if (SUPPORTED_LANGUAGES.has(body.language)) update.language = body.language;
    else errors.push("language must be en, hi or mr");
  }
  for (const field of ["marketing_enabled", "engagement_enabled"]) {
    if (!(field in body)) continue;
    if (typeof body[field] === "boolean" || body[field] === 0 || body[field] === 1) update[field] = body[field] ? 1 : 0;
    else errors.push(`${field} must be true or false`);
  }
  for (const field of ["quiet_hours_start", "quiet_hours_end"]) {
    if (!(field in body)) continue;
    if (body[field] === null || body[field] === "") update[field] = null;
    else if (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body[field]))) update[field] = `${body[field]}:00`;
    else errors.push(`${field} must be HH:MM or null`);
  }
  if (("quiet_hours_start" in update) !== ("quiet_hours_end" in update)) {
    errors.push("quiet_hours_start and quiet_hours_end must be sent together");
  }
  if (!errors.length && !Object.keys(update).length) errors.push("No preference fields were provided");
  return { update, errors };
}

/** Minutes from `nowMinutes` until the quiet window ends (0 when outside it). */
function minutesUntilQuietHoursEnd(start, end, nowMinutes) {
  if (!isWithinQuietHours(start, end, nowMinutes)) return 0;
  const to = toMinutes(end);
  return (to - nowMinutes + 24 * 60) % (24 * 60) || 24 * 60;
}

module.exports = {
  approvedLanguagesFor,
  checkPromotionalEligibility,
  isWithinQuietHours,
  minutesUntilQuietHoursEnd,
  normalizePreferenceUpdate,
  SUPPORTED_LANGUAGES,
  MODULE_MAP,
  TEMPLATE_EVENT_TYPES,
  TemplateRenderError,
  buildTemplateNotification,
  listPlaceholders,
  renderText,
  resolveLanguage,
  resolveModule,
};
