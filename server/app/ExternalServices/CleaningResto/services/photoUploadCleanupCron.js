const cron = require("node-cron");
const db = require("../../../../config/database");
const { deleteFromR2 } = require("../../../../utils/r2delete");

async function cleanupExpiredUploads(limit = 100) {
  const [candidates] = await db.execute(
    "SELECT reference_id referenceId FROM svc_enquiry_photo_uploads WHERE claimed_item_id IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR) ORDER BY created_at LIMIT ?",
    [limit],
  );
  let deleted = 0;

  for (const candidate of candidates) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [[upload]] = await connection.execute(
        "SELECT storage_key storageKey FROM svc_enquiry_photo_uploads WHERE reference_id=? AND claimed_item_id IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR) FOR UPDATE",
        [candidate.referenceId],
      );
      if (upload) {
        await deleteFromR2(upload.storageKey);
        await connection.execute(
          "DELETE FROM svc_enquiry_photo_uploads WHERE reference_id=? AND claimed_item_id IS NULL",
          [candidate.referenceId],
        );
        deleted += 1;
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error(
        "[external-services photo cleanup] Failed:",
        error.code || error.message,
      );
    } finally {
      connection.release();
    }
  }
  return deleted;
}

if (process.env.NODE_ENV !== "test") {
  cron.schedule("0 3 * * *", () => {
    cleanupExpiredUploads()
      .then((count) => {
        if (count)
          console.log(
            `[external-services photo cleanup] Removed ${count} expired upload(s).`,
          );
      })
      .catch((error) =>
        console.error(
          "[external-services photo cleanup] Failed:",
          error.code || error.message,
        ),
      );
  });
}

module.exports = { cleanupExpiredUploads };
