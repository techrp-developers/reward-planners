// Splash campaigns keep their artwork, schedule, priority and publication in
// ordinary CMS entries. Only vendor managers manage splash campaigns, so an
// entry linked to a splash placement or default may only be changed by them;
// every other CMS entry keeps its existing permissions.
//
// Race safety: a write by anyone else holds a per-entry MySQL lock for the
// whole request, and linking an entry (placement/default) takes the same lock.
// So an entry cannot become a splash campaign half-way through someone
// else's edit, and an edit cannot start while it is being linked.
const mysql = require("mysql2/promise");

// Locks live on their own small pool: a guarded request holds one of these for
// its whole duration while its handler uses the main pool, so they can never
// starve each other.
let lockPool = null;
function lockConnection() {
  if (!lockPool) {
    lockPool = mysql.createPool({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "rewardplanners_db",
      waitForConnections: true,
      connectionLimit: Number(process.env.CMS_LOCK_POOL_SIZE || 4),
      queueLimit: 0,
      charset: "utf8mb4",
    });
  }
  return lockPool.getConnection();
}

async function closeLockPool() {
  if (lockPool) await lockPool.end().catch(() => {});
  lockPool = null;
}

const SPLASH_MANAGER_ROLE = "vendor_manager";
const LOCK_WAIT_SECONDS = 5;

const lockName = (contentId) => `rp_cms_entry_${Number(contentId)}`;

async function isSplashLinked(conn, contentId) {
  const [[row]] = await conn.query(
    `SELECT EXISTS (SELECT 1 FROM cms_splashscreen_placements WHERE content_id = ?)
         OR EXISTS (SELECT 1 FROM cms_splashscreen_defaults WHERE default_content_id = ?) AS linked`,
    [contentId, contentId],
  );
  return Boolean(Number(row.linked));
}

class EntryBusyError extends Error {
  constructor() {
    super("This content is being changed by someone else. Try again in a moment.");
    this.statusCode = 409;
  }
}

/** Runs `fn(conn)` holding the entry's lock on a dedicated connection. */
async function withEntryLock(contentId, fn) {
  const conn = await lockConnection();
  let locked = false;
  try {
    const [[{ ok }]] = await conn.query("SELECT GET_LOCK(?, ?) AS ok", [lockName(contentId), LOCK_WAIT_SECONDS]);
    if (Number(ok) !== 1) throw new EntryBusyError();
    locked = true;
    return await fn(conn);
  } finally {
    if (locked) await conn.query("SELECT RELEASE_LOCK(?)", [lockName(contentId)]).catch(() => {});
    conn.release();
  }
}

/** Route guard for CMS writes on /entries/:id. Must run after authenticateToken. */
async function guardSplashLinkedEntry(req, res, next) {
  if (req.user?.role === SPLASH_MANAGER_ROLE) return next();
  const contentId = Number(req.params.id);
  // Malformed ids are left to the handler's own 400/404.
  if (!Number.isSafeInteger(contentId) || contentId <= 0) return next();

  let conn;
  let locked = false;
  const release = async () => {
    if (!conn) return;
    const held = conn;
    conn = null;
    if (locked) await held.query("SELECT RELEASE_LOCK(?)", [lockName(contentId)]).catch(() => {});
    held.release();
  };
  try {
    conn = await lockConnection();
    const [[{ ok }]] = await conn.query("SELECT GET_LOCK(?, ?) AS ok", [lockName(contentId), LOCK_WAIT_SECONDS]);
    if (Number(ok) !== 1) {
      await release();
      return res.status(409).json({ success: false, message: new EntryBusyError().message });
    }
    locked = true;
    if (await isSplashLinked(conn, contentId)) {
      await release();
      return res.status(403).json({
        success: false,
        code: "SPLASH_CAMPAIGN_CONTENT",
        message: "This content is used by a Dynamic Splash Screen campaign. Only Vendor Managers can change it.",
      });
    }
    // Held until the response is sent, so the write below cannot interleave with linking.
    res.once("finish", release);
    res.once("close", release);
    return next();
  } catch (error) {
    await release();
    // Before the splash tables are installed nothing can be linked.
    if (error.code === "ER_NO_SUCH_TABLE") return next();
    console.error("Splash link check failed:", error);
    return res.status(500).json({ success: false, message: "Could not check this content's permissions" });
  }
}

module.exports = { EntryBusyError, SPLASH_MANAGER_ROLE, closeLockPool, guardSplashLinkedEntry, isSplashLinked, withEntryLock };
