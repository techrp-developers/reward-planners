const cron = require("node-cron");
const db = require("../../config/database");
const { deleteFromR2 } = require("../../utils/r2delete");

const BATCH_SIZE = 200;
let cleanupRunning = false;

async function cleanupExpiredStatuses() {
  if (cleanupRunning) {
    console.log("[STATUS_CLEANUP] Previous cleanup is still running; skipping this cycle.");
    return { deleted: 0, failed: 0, skipped: true };
  }

  cleanupRunning = true;
  let deleted = 0;
  let failed = 0;

  try {
    const [expired] = await db.execute(
      `SELECT status_id, media_key
       FROM user_statuses
       WHERE expires_at <= UTC_TIMESTAMP()
       ORDER BY expires_at ASC
       LIMIT ${BATCH_SIZE}`,
    );

    for (const status of expired) {
      try {
        // Keep the row when R2 deletion fails. It stays invisible to users and
        // will be retried during the next cleanup instead of leaking media.
        if (status.media_key) await deleteFromR2(status.media_key);

        const [result] = await db.execute(
          `DELETE FROM user_statuses
           WHERE status_id = ? AND expires_at <= UTC_TIMESTAMP()`,
          [status.status_id],
        );
        deleted += result.affectedRows;
      } catch (error) {
        failed += 1;
        console.error(`[STATUS_CLEANUP] Failed status ${status.status_id}:`, error.message);
      }
    }

    console.log(`[STATUS_CLEANUP] Finished: ${deleted} deleted, ${failed} failed.`);
    return { deleted, failed, skipped: false };
  } catch (error) {
    console.error("[STATUS_CLEANUP] Job failed:", error);
    throw error;
  } finally {
    cleanupRunning = false;
  }
}

// Run at minute 15 of every hour. API queries hide a status at its exact
// expiry time; this job performs the slower physical DB/R2 cleanup afterward.
cron.schedule("15 * * * *", () => {
  cleanupExpiredStatuses().catch(() => {});
}, { timezone: "UTC" });

module.exports = { cleanupExpiredStatuses };
