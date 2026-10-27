const cron = require("node-cron");
const { runCampaignWorkerOnce } = require("./campaignWorker");

// One shared queue worker for every campaign; campaigns never get their own
// cron task. noOverlap plus the row locks keep runs from stepping on each other.
cron.schedule("* * * * *", async () => {
  try {
    await runCampaignWorkerOnce();
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") return; // campaign migration not applied yet
    console.error("[Campaign Worker] Run failed:", error.message);
  }
}, { noOverlap: true, name: "notification-campaigns" });
