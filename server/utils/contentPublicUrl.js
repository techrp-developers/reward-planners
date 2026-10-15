const { getPublicUrl } = require("./publicUrl");

const DEFAULT_PORT = process.env.PORT || 5000;
const DEFAULT_LOCAL_BASE_URL = `http://localhost:${DEFAULT_PORT}`;

const LEGACY_HOST = "mpsl.rewardplanners.com";
const MAIN_HOST = "rewardplanners.com";

function getContentPublicBaseUrl() {
  const configured = process.env.PUBLIC_BASE_URL;
  const base =
    (configured && configured.trim()) || DEFAULT_LOCAL_BASE_URL;

  return base.replace(/\/+$/, "");
}

function getContentImageUrl(storedPath) {
  if (!storedPath) return null;

  const normalized = String(storedPath).trim();
  if (!normalized) return null;

  // Handle already-complete HTTP(S) URLs.
  // Replace the old subdomain with the main domain.
  if (/^https?:\/\//i.test(normalized)) {
    try {
      const url = new URL(normalized);

      if (url.hostname.toLowerCase() === LEGACY_HOST) {
        url.hostname = MAIN_HOST;
      }

      return url.toString();
    } catch {
      return normalized;
    }
  }

  // Remove leading slashes and an optional /uploads prefix.
  const cleanPath = normalized
    .replace(/^\/+/, "")
    .replace(/^uploads\/+/i, "");

  // R2 assets use the CDN.
  if (cleanPath.startsWith("public/")) {
    return getPublicUrl(cleanPath);
  }

  // Legacy assets use the configured public API origin.
  return `${getContentPublicBaseUrl()}/uploads/${cleanPath}`;
}

module.exports = {
  getContentPublicBaseUrl,
  getContentImageUrl,
};