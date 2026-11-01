const cron = require("node-cron");
const { recoverTransactionRewards } = require("./transactionRewardService");
let running = false;
cron.schedule("* * * * *", async () => {
  if (running) return;
  running = true;
  try { await recoverTransactionRewards(); }
  catch (error) { console.error("Transaction reward recovery:", error.message); }
  finally { running = false; }
});
