// Dynamic splash screens and page campaigns: validation and resolution on top
// of the existing CMS entries (content_zone_entries).
const sharp = require("sharp");
const SplashscreenModel = require("../models/splashscreenModel");
const { getContentImageUrl } = require("../utils/contentPublicUrl");
const { contentNavigation } = require("../utils/contentNavigation");
const { fetchAllowedImage } = require("../app/common/utils/notificationImage");
const {
  AUDIENCES, DISPLAY_SECONDS, FALLBACK_POLICIES, FREQUENCY_RULES, PLATFORMS,
  displaySettings, isValidPageSlot, slotKind,
} = require("../utils/splashRegistry");

const ARTWORK_HOST = "cdn.rewardplanners.com";
const ARTWORK_FORMATS = new Set(["jpeg", "png", "webp"]);
const ARTWORK_MIN = { width: 600, height: 300 };
// The app re-asks at least this often; sooner when a campaign ends or starts.
const MAX_CACHE_SECONDS = 300;
// Links a campaign may open outside the app. Everything else is dropped.
const LINK_HOSTS = String(process.env.SPLASH_LINK_HOSTS || "rewardplanners.com")
  .split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);

class SplashValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "SplashValidationError";
    this.statusCode = status;
  }
}

/* ---------------- time ---------------- */

// MySQL returns UTC DATETIMEs as "YYYY-MM-DD HH:MM:SS" (dateStrings) or Date.
function toIso(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(text)) return null;
  return `${text.slice(0, 19).replace(" ", "T")}.000Z`;
}

/**
 * An admin-chosen instant. It must carry a zone ("Z" or "+05:30"): a bare
 * local time is ambiguous, so it is refused rather than guessed.
 * Returns the UTC "YYYY-MM-DD HH:MM:SS" MySQL compares with.
 */
function parseInstant(value, field = "at") {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i.test(text)) {
    throw new SplashValidationError(`${field} must be an ISO 8601 time with a zone, e.g. 2026-11-10T09:00:00+05:30`);
  }
  // Date() rolls 2026-02-30 over to March; refuse impossible calendar dates.
  const [year, month, day] = text.slice(0, 10).split("-").map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  const date = new Date(text);
  if (Number.isNaN(date.getTime()) || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {
    throw new SplashValidationError(`${field} is not a valid time`);
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function secondsBetween(fromUtc, toUtc) {
  return Math.floor((new Date(toIso(toUtc)).getTime() - new Date(toIso(fromUtc)).getTime()) / 1000);
}

/* ---------------- media and links ---------------- */

/** Artwork URL, only when it is served from the CDN over HTTPS. */
function artworkUrl(entry) {
  const url = getContentImageUrl(entry?.image_path);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname.toLowerCase() === ARTWORK_HOST ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function safeLink(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value).trim());
    const host = url.hostname.toLowerCase();
    const allowed = LINK_HOSTS.some((base) => host === base || host.endsWith(`.${base}`));
    return url.protocol === "https:" && allowed && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Downloads the artwork the way a phone would and checks what it really is.
 * Used when a placement or default is saved, never on the app's request path.
 */
async function checkArtwork(entry, { fetchImage = fetchAllowedImage } = {}) {
  const url = artworkUrl(entry);
  if (!url) throw new SplashValidationError("This content has no image on the Reward Planners CDN. Upload artwork to the entry first.", 422);
  let buffer;
  try {
    buffer = await fetchImage(url);
  } catch (error) {
    throw new SplashValidationError(`The artwork could not be loaded: ${error.message}`, 422);
  }
  let metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new SplashValidationError("The artwork is not a readable image.", 422);
  }
  if (!ARTWORK_FORMATS.has(metadata.format)) throw new SplashValidationError("Artwork must be a JPG, PNG or WebP image.", 422);
  if ((metadata.pages || 1) > 1) throw new SplashValidationError("Animated artwork is not supported.", 422);
  if (metadata.width < ARTWORK_MIN.width || metadata.height < ARTWORK_MIN.height) {
    throw new SplashValidationError(`Artwork must be at least ${ARTWORK_MIN.width}×${ARTWORK_MIN.height} px (it is ${metadata.width}×${metadata.height}).`, 422);
  }
  return { url, format: metadata.format, width: metadata.width, height: metadata.height, bytes: buffer.length };
}

/* ---------------- validation ---------------- */

const positiveId = (value, field) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new SplashValidationError(`${field} must be a positive id`);
  return id;
};

function assertPageSlot(pageKey, slotKey) {
  if (!isValidPageSlot(pageKey, slotKey)) {
    throw new SplashValidationError(`Unknown page/slot "${pageKey}/${slotKey}". See GET /content/splashscreens/pages.`);
  }
}

const oneOf = (value, list, field, fallback) => {
  const chosen = value == null || value === "" ? fallback : value;
  if (!list.includes(chosen)) throw new SplashValidationError(`${field} must be one of ${list.join(", ")}`);
  return chosen;
};

/** Frequency and duration that suit the slot: banners never time out. */
function displayFields(slotKey, body, current = {}) {
  const has = (key) => Object.hasOwn(body, key);
  if (slotKind(slotKey) === "banner") {
    if (has("frequency_rule") && body.frequency_rule !== "every_visit") throw new SplashValidationError("Banners are shown on every visit; frequency_rule must be every_visit");
    if (has("display_seconds") && body.display_seconds != null) throw new SplashValidationError("Banners do not time out; display_seconds must be empty");
    return { frequency_rule: "every_visit", display_seconds: null };
  }
  const frequency = oneOf(has("frequency_rule") ? body.frequency_rule : current.frequency_rule, FREQUENCY_RULES, "frequency_rule", "once_per_day");
  let seconds = has("display_seconds") ? body.display_seconds : current.display_seconds ?? null;
  if (seconds != null && seconds !== "") {
    seconds = Number(seconds);
    if (!Number.isInteger(seconds) || seconds < DISPLAY_SECONDS.min || seconds > DISPLAY_SECONDS.max) {
      throw new SplashValidationError(`display_seconds must be a whole number from ${DISPLAY_SECONDS.min} to ${DISPLAY_SECONDS.max}`);
    }
  } else seconds = null;
  return { frequency_rule: frequency, display_seconds: seconds };
}

async function validatePlacement(body, deps = {}) {
  const model = deps.model || SplashscreenModel;
  const pageKey = String(body.page_key || "");
  const slotKey = String(body.slot_key || "");
  assertPageSlot(pageKey, slotKey);
  const contentId = positiveId(body.content_id, "content_id");
  const entry = await model.getEntry(contentId);
  if (!entry) throw new SplashValidationError("Content entry not found", 404);
  if (entry.content_type !== "image") throw new SplashValidationError("Only image content can be used as a splash or campaign.", 422);
  const artwork = await checkArtwork(entry, deps);
  return {
    values: {
      content_id: contentId, page_key: pageKey, slot_key: slotKey,
      platform: oneOf(body.platform, PLATFORMS, "platform", "all"),
      audience: oneOf(body.audience, AUDIENCES, "audience", "all"),
      ...displayFields(slotKey, body),
      is_enabled: body.is_enabled == null ? true : Boolean(body.is_enabled) && body.is_enabled !== "false" && body.is_enabled !== 0,
    },
    entry, artwork,
  };
}

function validatePlacementPatch(body, current) {
  const patch = {};
  if (Object.hasOwn(body, "platform")) patch.platform = oneOf(body.platform, PLATFORMS, "platform");
  if (Object.hasOwn(body, "audience")) patch.audience = oneOf(body.audience, AUDIENCES, "audience");
  if (Object.hasOwn(body, "is_enabled")) patch.is_enabled = body.is_enabled === true || body.is_enabled === 1 || body.is_enabled === "true";
  if (Object.hasOwn(body, "frequency_rule") || Object.hasOwn(body, "display_seconds")) {
    Object.assign(patch, displayFields(current.slot_key, body, current));
  }
  for (const key of ["content_id", "page_key", "slot_key"]) {
    if (Object.hasOwn(body, key) && String(body[key]) !== String(current[key])) {
      throw new SplashValidationError(`${key} cannot be changed; remove this placement and add a new one`);
    }
  }
  if (!Object.keys(patch).length) throw new SplashValidationError("Nothing to update");
  return patch;
}

async function validateDefault(body, deps = {}) {
  const model = deps.model || SplashscreenModel;
  const pageKey = String(body.page_key || "");
  const slotKey = String(body.slot_key || "");
  assertPageSlot(pageKey, slotKey);
  const values = {
    page_key: pageKey, slot_key: slotKey,
    platform: oneOf(body.platform, PLATFORMS, "platform", "all"),
    fallback_policy: oneOf(body.fallback_policy, FALLBACK_POLICIES, "fallback_policy", "skip"),
    default_content_id: body.default_content_id == null || body.default_content_id === "" ? null : positiveId(body.default_content_id, "default_content_id"),
  };
  if (values.fallback_policy === "skip") return { values, artwork: null, publish: false };
  if (!values.default_content_id) throw new SplashValidationError("show_content needs default_content_id");
  const entry = await model.getEntry(values.default_content_id);
  if (!entry) throw new SplashValidationError("Default content entry not found", 404);
  if (entry.content_type !== "image") throw new SplashValidationError("Only image content can be a default.", 422);
  // publish_content: the entry is published together with being linked (one transaction).
  const publishContent = body.publish_content === true || body.publish_content === "true";
  if (!publishContent && !Number(entry.is_published)) throw new SplashValidationError("Publish the default content first.", 422);
  // Defaults are evergreen: an end date would silently empty the slot.
  if (entry.end_utc) throw new SplashValidationError("Default content must not have an end date. Use a separate evergreen entry.", 422);
  const startsLater = entry.start_utc && new Date(toIso(entry.start_utc)) > new Date(toIso(await model.serverTimeUtc()));
  if (entry.content_status === "scheduled" || startsLater) throw new SplashValidationError("Default content must already be live, not scheduled for later.", 422);
  return { values, artwork: await checkArtwork(entry, deps), publish: publishContent && !Number(entry.is_published) };
}

/* ---------------- resolution ---------------- */

function presentCampaign(entry, { slotKey, placement = null }) {
  return {
    content_id: Number(entry.content_id),
    placement_id: placement ? Number(placement.placement_id) : null,
    title: entry.title,
    cta_text: entry.cta_text || null,
    image_url: artworkUrl(entry),
    display_mode: entry.display_mode,
    motion: { effect: entry.motion_effect || "none", intensity: entry.motion_intensity || "medium", speed: entry.motion_speed || "normal" },
    // Opens an approved in-app destination; an outside link only on our own HTTPS hosts.
    navigation: contentNavigation(entry),
    link: safeLink(entry.redirect_link),
    priority: Number(entry.priority) || 0,
    starts_at: toIso(entry.start_utc),
    expires_at: toIso(entry.end_utc),
    display: displaySettings(slotKey, placement ? { frequencyRule: placement.frequency_rule, displaySeconds: placement.display_seconds } : {}),
  };
}

/**
 * The campaign a page/slot shows at `nowUtc` (default: database time).
 * source: scheduled_campaign | default | none.
 */
async function resolveSplash({ pageKey, slotKey, platform, audience, nowUtc = null }, deps = {}) {
  const model = deps.model || SplashscreenModel;
  assertPageSlot(pageKey, slotKey);
  if (!["android", "ios"].includes(platform)) throw new SplashValidationError("platform must be android or ios");
  if (!["authenticated", "guest"].includes(audience)) throw new SplashValidationError("audience must be authenticated or guest");

  const now = nowUtc || (await model.serverTimeUtc());
  const query = { pageKey, slotKey, platform, audience, nowUtc: now };
  const [candidates, nextStart] = await Promise.all([model.liveCandidates(query), model.nextStartUtc(query)]);

  let source = "none";
  let campaign = null;
  // Highest-precedence campaign whose artwork is usable; a broken one is skipped.
  const chosen = candidates.find((row) => artworkUrl(row));
  if (chosen) {
    source = "scheduled_campaign";
    campaign = presentCampaign(chosen, { slotKey, placement: chosen });
  } else {
    const fallback = await model.findDefault(pageKey, slotKey, platform);
    if (fallback?.fallback_policy === "show_content" && fallback.default_content_id) {
      const entry = await model.getEntry(fallback.default_content_id, now);
      // Re-checked on every request: a default unpublished, ended or stripped
      // of its image since it was saved shows nothing rather than a broken slot.
      if (entry && entry.content_type === "image" && entry.content_status === "active" && artworkUrl(entry)) {
        source = "default";
        campaign = presentCampaign(entry, { slotKey });
      }
    }
  }

  const limits = [MAX_CACHE_SECONDS];
  if (campaign?.expires_at) limits.push(secondsBetween(now, campaign.expires_at));
  if (nextStart) limits.push(secondsBetween(now, nextStart));
  const ttl = Math.max(0, Math.min(...limits));

  return {
    source,
    page_key: pageKey, slot_key: slotKey, platform, audience,
    server_time: toIso(now),
    expires_at: campaign?.expires_at || null,
    next_change_at: toIso(nextStart),
    cache_ttl_seconds: ttl,
    campaign,
  };
}

module.exports = {
  ARTWORK_MIN, MAX_CACHE_SECONDS, SplashValidationError,
  artworkUrl, checkArtwork, parseInstant, presentCampaign, resolveSplash, safeLink, toIso,
  validateDefault, validatePlacement, validatePlacementPatch,
};
