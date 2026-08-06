const cron = require("node-cron");
const { processDueReminders } = require("./todoReminderService");

// Run every minute
cron.schedule("* * * * *", async () => {
  console.log("[Cron] Checking due todo reminders...");

  try {
    await processDueReminders(100);
  } catch (error) {
    console.error("[Cron] Error running todo reminder job:", error);
  }
});
