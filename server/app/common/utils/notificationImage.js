// Notification image handling: safe fetching from our own CDN, content-based
// validation, and normalisation to a JPEG that Android (BigPicture) and iOS
// (Notification Service Extension attachment) both render.
const crypto = require("node:crypto");
const sharp = require("sharp");
const { IMAGE_HOSTS } = require("./notificationPayload");

const OUTPUT = { width: 1200, height: 600 };
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 300 * 1024;
// FCM rejects/ignores notification images larger than 1 MB on Android.
const MAX_DELIVERABLE_BYTES = 1024 * 1024;
const MIN_INPUT = { width: 300, height: 150 };
const DECODABLE = new Set(["jpeg", "png", "webp"]);
const DECLARED_TO_FORMAT = { "image/jpeg": "jpeg", "image/jpg": "jpeg", "image/png": "png", "image/webp": "webp" };

class ImageValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ImageValidationError";
    this.status = 422;
  }
}

/** Only HTTPS URLs on our asset hosts; anything else is never fetched. */
function assertAllowedUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { throw new ImageValidationError("Image URL is invalid."); }
  if (url.protocol !== "https:") throw new ImageValidationError("Image URL must use HTTPS.");
  if (!IMAGE_HOSTS.includes(url.hostname.toLowerCase())) throw new ImageValidationError("Images must come from the Reward Planners asset host.");
  if (url.username || url.password || (url.port && url.port !== "443")) throw new ImageValidationError("Image URL is not allowed.");
  return url;
}

async function readLimited(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new ImageValidationError("Image is too large.");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ImageValidationError("Image is too large.");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/**
 * Fetch a catalog image (product/service/banner) from our CDN. Redirects are
 * refused so an allow-listed URL cannot bounce the server elsewhere (SSRF).
 */
async function fetchAllowedImage(value, { fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  const url = assertAllowedUrl(value);
  let response;
  try {
    response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new ImageValidationError("The source image could not be downloaded.");
  }
  if (!response.ok) throw new ImageValidationError(`The source image returned HTTP ${response.status}.`);
  if (!/^image\//i.test(response.headers.get("content-type") || "")) throw new ImageValidationError("The source is not an image.");
  return readLimited(response, MAX_INPUT_BYTES);
}

/**
 * Decode the actual bytes (never trusting the extension or declared type),
 * then re-encode to a metadata-free 1200x600 JPEG under 300 KB. Non-banner
 * shapes are letterboxed on white so products are never cropped.
 */
async function normalizeNotificationImage(buffer, { declaredMime = null, maxOutputBytes = MAX_OUTPUT_BYTES } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new ImageValidationError("The image is empty.");
  if (buffer.length > MAX_INPUT_BYTES) throw new ImageValidationError("Images must be 5 MB or smaller.");

  let metadata;
  try {
    metadata = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new ImageValidationError("The file is not a readable image.");
  }
  if (!DECODABLE.has(metadata.format)) throw new ImageValidationError("Use a JPG, PNG or WebP image.");
  if (declaredMime && DECLARED_TO_FORMAT[declaredMime] && DECLARED_TO_FORMAT[declaredMime] !== metadata.format) {
    throw new ImageValidationError("The file content does not match its type.");
  }
  if ((metadata.pages || 1) > 1) throw new ImageValidationError("Animated images are not supported in notifications.");
  if (metadata.width < MIN_INPUT.width || metadata.height < MIN_INPUT.height) {
    throw new ImageValidationError(`Images must be at least ${MIN_INPUT.width}×${MIN_INPUT.height} px (recommended 1200×600).`);
  }

  const pipeline = sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize(OUTPUT.width, OUTPUT.height, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: "#ffffff" });

  // The stored size limit is a hard rule: an image that cannot be compressed
  // under it is rejected rather than stored oversized.
  for (const quality of [82, 74, 66, 58, 50]) {
    const output = await pipeline.clone().jpeg({ quality, mozjpeg: true, progressive: false }).toBuffer();
    if (output.length <= maxOutputBytes) {
      return {
        buffer: output,
        mimeType: "image/jpeg",
        width: OUTPUT.width,
        height: OUTPUT.height,
        bytes: output.length,
        source: { format: metadata.format, width: metadata.width, height: metadata.height },
      };
    }
  }
  throw new ImageValidationError(`The image is too detailed to compress under ${Math.round(maxOutputBytes / 1024)} KB. Use a simpler image.`);
}

function notificationStorageKey(now = new Date()) {
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `public/notifications/${now.getUTCFullYear()}/${month}/${crypto.randomUUID()}.jpg`;
}

// Library assets live under this CDN prefix; nothing else is ever sent.
const NOTIFICATION_PATH_PREFIX = "/public/notifications/";

/**
 * Pre-send check of a stored notification image, as a phone would fetch it:
 * our CDN host and library path, HTTP 200 without redirects, JPEG/PNG, and
 * the real size within the stored limit (measured when the CDN omits
 * Content-Length). Returns { ok, reason }.
 */
async function checkImageAvailable(value, { fetchImpl = fetch, timeoutMs = 6000, maxBytes = MAX_OUTPUT_BYTES } = {}) {
  try {
    const url = assertAllowedUrl(value);
    if (!url.pathname.startsWith(NOTIFICATION_PATH_PREFIX)) return { ok: false, reason: "Not a notification library image" };
    const response = await fetchImpl(url, { method: "HEAD", redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };
    const type = response.headers.get("content-type") || "";
    if (!/^image\/(jpeg|png)/i.test(type)) return { ok: false, reason: `Unsupported content type ${type || "(none)"}` };

    let length = Number(response.headers.get("content-length") || 0);
    if (!length) {
      const body = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
      if (!body.ok) return { ok: false, reason: `HTTP ${body.status}` };
      length = (await readLimited(body, maxBytes)).length;
    }
    if (length > maxBytes) return { ok: false, reason: `Image is larger than ${Math.round(maxBytes / 1024)} KB` };
    if (length > MAX_DELIVERABLE_BYTES) return { ok: false, reason: "Image is larger than FCM's 1 MB limit" };
    return { ok: true, bytes: length };
  } catch (error) {
    return { ok: false, reason: error instanceof ImageValidationError ? error.message : "Image could not be reached" };
  }
}

module.exports = {
  ImageValidationError,
  MAX_INPUT_BYTES,
  MAX_OUTPUT_BYTES,
  OUTPUT,
  assertAllowedUrl,
  checkImageAvailable,
  fetchAllowedImage,
  normalizeNotificationImage,
  notificationStorageKey,
};
