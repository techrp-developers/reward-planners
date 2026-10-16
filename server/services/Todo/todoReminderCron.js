const cron = require("node-cron");
const { processDueReminders } = require("./todoReminderService");
const SCHEDULE_TIMEZONE = process.env.SCHEDULE_TIMEZONE || "Asia/Kolkata";

// Run every minute
cron.schedule("* * * * *", async () => {
  if (process.env.SCHEDULER_DIAGNOSTICS === "true") console.log("[Cron] Checking due todo reminders...");

  try {
    await processDueReminders(100);
  } catch (error) {
    console.error("[Cron] Error running todo reminder job:", error);
  }
}, { timezone: SCHEDULE_TIMEZONE, noOverlap: true, name: "todo-reminders" });
