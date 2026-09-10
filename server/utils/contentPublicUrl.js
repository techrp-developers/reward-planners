// Builds a complete, network-reachable URL for a Content Management image
// from the relative path stored in the DB (e.g. "content-zone-entries/foo.png").
//
// Unlike utils/publicUrl.js (hardcoded to the production CDN domain), this
// base URL is environment-configurable because content-zone images are
// served from this server's own /uploads static route, not the CDN:
//   - Local dev on a physical phone: set PUBLIC_BASE_URL to the dev
//     machine's LAN IP, e.g. PUBLIC_BASE_URL=http://192.168.1.10:5000
//     ("localhost" in that URL would resolve to the phone itself).
//   - Local dev in an emulator/simulator or Postman/browser on the same
//     machine: leave PUBLIC_BASE_URL unset; it falls back to
//     http://localhost:<PORT>.
//   - Production: set PUBLIC_BASE_URL to the public API origin, e.g.
//     https://rewardplanners.com (the reverse proxy forwards /uploads
//     the same way it forwards /api/crm).
const DEFAULT_PORT = process.env.PORT || 5000;
const DEFAULT_LOCAL_BASE_URL = `http://localhost:${DEFAULT_PORT}`;

function getContentPublicBaseUrl() {
  const configured = process.env.PUBLIC_BASE_URL;
  const base = (configured && configured.trim()) || DEFAULT_LOCAL_BASE_URL;
  return base.replace(/\/+$/, "");
}

// storedPath is whatever was saved to content_zone_entries.image_url —
// always a path relative to /uploads, never a host, whether or not it
// already carries the "uploads/" segment itself. If a full http(s) URL
// somehow ends up there already, it's returned unchanged.
function getContentImageUrl(storedPath) {
  if (!storedPath) return null;

  const normalized = String(storedPath).trim();
  if (!normalized) return null;

  if (/^https?:\/\//i.test(normalized)) return normalized;

  const relative = normalized.replace(/^\/+/, "").replace(/^uploads\/+/i, "");
  return `${getContentPublicBaseUrl()}/uploads/${relative}`;
}

module.exports = { getContentPublicBaseUrl, getContentImageUrl };
