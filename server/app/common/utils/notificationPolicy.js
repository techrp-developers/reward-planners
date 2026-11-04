// Central delivery policy applied by deliverNotification()/notifyUser() to
// every notification: automatic module events, template sends and campaigns.
// Transactional events (orders, payments, OTP/account, support, rewards,
// reminders for the employee's own items) always pass. Promotional events
// need a stored opt-in; announcements need no consent but respect quiet hours
// and their own daily limit. A missing preference row is never consent.
const NotificationTemplateModel = require("../models/notificationTemplateModel");
const { checkPromotionalEligibility, minutesUntilQuietHoursEnd } = require("./notificationTemplate");
const { EMPLOYEE_TIMEZONE, minutesInZone, startOfDayUtc } = require("./campaignSchedule");

// Automatic events that are nudges rather than responses to something the
// employee did. Every other automatic type is transactional.
const PROMOTIONAL_EVENT_CATEGORY = {
  cart_abandonment: "marketing",
  cart_low_stock: "marketing",
  cart_price_drop: "marketing",
  payment_abandoned: "marketing",
  service_bundle_upsell: "marketing",
  fitness_midday_hook: "engagement",
  fitness_almost_completed: "engagement",
  coworker_birthday: "engagement",
};

const PROMOTIONAL_CATEGORIES = ["marketing", "engagement"];
const CAPS = {
  promotional: Number(process.env.NOTIFICATION_PROMO_DAILY_CAP || 2),
  announcement: Number(process.env.NOTIFICATION_ANNOUNCEMENT_DAILY_CAP || 2),
};

/** marketing | engagement | announcement | transactional */
function notificationCategory(payload) {
  const declared = payload?.metadata?.category;
  if (["marketing", "engagement", "announcement"].includes(declared)) return declared;
  return PROMOTIONAL_EVENT_CATEGORY[payload?.type] || "transactional";
}

/**
 * Decide whether `payload` may be delivered now.
 * Returns { allowed, reason?, category, resumeAt? }. `excludeNotificationId`
 * keeps a retried campaign's own inbox row out of its daily-limit count.
 */
async function evaluateDeliveryPolicy(payload, { now = new Date(), excludeNotificationId = null, model = NotificationTemplateModel } = {}) {
  const category = notificationCategory(payload);
  if (category === "transactional") return { allowed: true, category };

  const userId = payload.userId ?? payload.user_id;
  const preferences = await model.getPreferences(userId);
  const counted = category === "announcement" ? ["announcement"] : PROMOTIONAL_CATEGORIES;
  const needsCount = category === "announcement" || (preferences && !preferences.missing);
  const sentToday = needsCount
    ? await model.countCategoryToday(userId, counted, { sinceUtc: startOfDayUtc(now, EMPLOYEE_TIMEZONE), excludeNotificationId })
    : 0;
  const nowMinutes = minutesInZone(now, EMPLOYEE_TIMEZONE);

  const eligibility = checkPromotionalEligibility({
    category,
    preferences,
    sentToday,
    dailyCap: category === "announcement" ? CAPS.announcement : CAPS.promotional,
    nowMinutes,
  });
  if (eligibility.allowed) return { allowed: true, category };

  const result = { allowed: false, reason: eligibility.reason, category };
  if (eligibility.reason === "quiet_hours") {
    const minutes = minutesUntilQuietHoursEnd(preferences.quiet_hours_start, preferences.quiet_hours_end, nowMinutes);
    result.resumeAt = new Date(now.getTime() + minutes * 60 * 1000);
  }
  return result;
}

module.exports = {
  CAPS,
  PROMOTIONAL_EVENT_CATEGORY,
  evaluateDeliveryPolicy,
  notificationCategory,
};
