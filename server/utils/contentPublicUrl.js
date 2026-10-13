// Builds a complete, network-reachable URL for a Content Management image
// from the relative path stored in the DB (e.g. "content-zone-entries/foo.png").
//
// R2 keys use the CDN. Legacy content-zone images use this server's /uploads
// route, whose base URL is environment-configurable:
//   - Local dev on a physical phone: set PUBLIC_BASE_URL to the dev
//     machine's LAN IP, e.g. PUBLIC_BASE_URL=http://192.168.1.10:5000
//     ("localhost" in that URL would resolve to the phone itself).
//   - Local dev in an emulator/simulator or Postman/browser on the same
//     machine: leave PUBLIC_BASE_URL unset; it falls back to
//     http://localhost:<PORT>.
//   - Production: set PUBLIC_BASE_URL to the public API origin, e.g.
//     https://rewardplanners.com (the reverse proxy forwards /uploads
//     the same way it forwards /api/crm).
const { getPublicUrl } = require("./publicUrl");
const DEFAULT_PORT = process.env.PORT || 5000;
const DEFAULT_LOCAL_BASE_URL = `http://localhost:${DEFAULT_PORT}`;

function getContentPublicBaseUrl() {
  const configured = process.env.PUBLIC_BASE_URL;
  const base = (configured && configured.trim()) || DEFAULT_LOCAL_BASE_URL;
  return base.replace(/\/+$/, "");
}

// Accept R2 keys, legacy upload paths, and already-complete HTTP(S) URLs.
function getContentImageUrl(storedPath) {
  if (!storedPath) return null;

  const normalized = String(storedPath).trim();
  if (!normalized) return null;

  if (/^https?:\/\//i.test(normalized)) return normalized;

  // New content uploads are R2 keys; only legacy assets live under /uploads.
  if (normalized.replace(/^\/+/, "").startsWith("public/")) {
    return getPublicUrl(normalized);
  }

  const relative = normalized.replace(/^\/+/, "").replace(/^uploads\/+/i, "");
  return `${getContentPublicBaseUrl()}/uploads/${relative}`;
}

module.exports = { getContentPublicBaseUrl, getContentImageUrl };
