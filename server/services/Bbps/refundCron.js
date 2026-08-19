const cron = require("node-cron");
const { processPendingRefunds } = require("../../app/bbps/v1/services/refundService");

cron.schedule("*/2 * * * *", async () => {
  try {
    console.log("[BBPS][refund] retry cron running...");
    await processPendingRefunds();
  } catch (error) {
    console.error("[BBPS][refund] cron failed", error);
  }
});
