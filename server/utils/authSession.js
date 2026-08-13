const crypto = require("crypto");
const db = require("../config/database");
const { generateToken } = require("./jwt");

// Versioned names prevent legacy host/domain cookies from selecting the wrong
// account after the auth storage migration.
const ACCESS_COOKIE = "rp_access_v2";
const REFRESH_COOKIE = "rp_refresh_v2";
const CSRF_COOKIE = "rp_csrf_v2";
const LEGACY_COOKIES = ["rp_access", "rp_refresh", "rp_csrf"];
const REFRESH_DAYS = 7;
let tableReady;

function ensureRefreshTokenTable() {
  tableReady ||= db.execute(`CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    family_id CHAR(36) NOT NULL,
    expires_at DATETIME NOT NULL,
    revoked_at DATETIME NULL,
    replaced_by_hash CHAR(64) NULL,
    user_agent VARCHAR(255) NULL,
    ip_address VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_refresh_user (user_id), INDEX idx_refresh_family (family_id),
    INDEX idx_refresh_expiry (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch((error) => {
    tableReady = undefined;
    throw error;
  });
  return tableReady;
}

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const randomToken = () => crypto.randomBytes(48).toString("base64url");

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [decodeURIComponent(index < 0 ? part : part.slice(0, index)), decodeURIComponent(index < 0 ? "" : part.slice(index + 1))];
  }));
}

function cookieOptions(httpOnly, maxAge) {
  return { httpOnly, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge };
}

function setSessionCookies(res, userId, refreshToken) {
  const legacyBase = { secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" };
  for (const name of LEGACY_COOKIES) res.clearCookie(name, { ...legacyBase, httpOnly: name !== "rp_csrf" });
  res.cookie(ACCESS_COOKIE, generateToken({ user_id: userId, type: "access" }), cookieOptions(true, 15 * 60 * 1000));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions(true, REFRESH_DAYS * 24 * 60 * 60 * 1000));
  res.cookie(CSRF_COOKIE, randomToken(), cookieOptions(false, REFRESH_DAYS * 24 * 60 * 60 * 1000));
}

function clearSessionCookies(res) {
  const base = { secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" };
  res.clearCookie(ACCESS_COOKIE, { ...base, httpOnly: true });
  res.clearCookie(REFRESH_COOKIE, { ...base, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false });
  for (const name of LEGACY_COOKIES) res.clearCookie(name, { ...base, httpOnly: name !== "rp_csrf" });
}

function isCsrfValid(req) {
  const cookies = parseCookies(req);
  const header = req.get("x-csrf-token");
  const csrfCookie = cookies[CSRF_COOKIE] || cookies.rp_csrf;
  if (!csrfCookie || !header) return false;
  const first = Buffer.from(csrfCookie);
  const second = Buffer.from(header);
  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

async function issueSession(userId, req, res, familyId = crypto.randomUUID()) {
  await ensureRefreshTokenTable();
  const refreshToken = randomToken();
  await db.execute(
    `INSERT INTO auth_refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, hashToken(refreshToken), familyId, new Date(Date.now() + REFRESH_DAYS * 86400000), String(req.get("user-agent") || "").slice(0, 255), req.ip || null],
  );
  setSessionCookies(res, userId, refreshToken);
}

async function rotateSession(req, res) {
  await ensureRefreshTokenTable();
  const cookies = parseCookies(req);
  const rawToken = cookies[REFRESH_COOKIE] || cookies.rp_refresh;
  if (!rawToken || !isCsrfValid(req)) return null;
  const tokenHash = hashToken(rawToken);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[stored]] = await connection.execute("SELECT * FROM auth_refresh_tokens WHERE token_hash = ? FOR UPDATE", [tokenHash]);
    if (!stored || stored.revoked_at || new Date(stored.expires_at) <= new Date()) {
      if (stored?.family_id) await connection.execute("UPDATE auth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE family_id = ?", [stored.family_id]);
      await connection.commit();
      return null;
    }
    const [[user]] = await connection.execute("SELECT user_id FROM eusers WHERE user_id = ? AND is_verified = 1 LIMIT 1", [stored.user_id]);
    if (!user) { await connection.rollback(); return null; }

    const nextToken = randomToken();
    const nextHash = hashToken(nextToken);
    await connection.execute("UPDATE auth_refresh_tokens SET revoked_at = NOW(), replaced_by_hash = ? WHERE id = ?", [nextHash, stored.id]);
    await connection.execute(
      `INSERT INTO auth_refresh_tokens (user_id, token_hash, family_id, expires_at, user_agent, ip_address) VALUES (?, ?, ?, ?, ?, ?)`,
      [stored.user_id, nextHash, stored.family_id, new Date(Date.now() + REFRESH_DAYS * 86400000), String(req.get("user-agent") || "").slice(0, 255), req.ip || null],
    );
    await connection.commit();
    setSessionCookies(res, stored.user_id, nextToken);
    return stored.user_id;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

async function revokeSession(req, res) {
  await ensureRefreshTokenTable();
  const cookies = parseCookies(req);
  const rawToken = cookies[REFRESH_COOKIE] || cookies.rp_refresh;
  if (rawToken) await db.execute("UPDATE auth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE token_hash = ?", [hashToken(rawToken)]);
  clearSessionCookies(res);
}

async function revokeUserSessions(userId) {
  await ensureRefreshTokenTable();
  await db.execute("UPDATE auth_refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE user_id = ?", [userId]);
}

module.exports = { ACCESS_COOKIE, parseCookies, issueSession, rotateSession, revokeSession, revokeUserSessions, isCsrfValid, clearSessionCookies };
