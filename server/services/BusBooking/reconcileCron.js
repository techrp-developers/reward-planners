const cron = require("node-cron");
const { cronPing } = require("../cronMonitor");
const {
  expireStaleBlocks,
  bookAbandonedPaidOrders,
  escalateStuckBookings,
} = require("../../app/busboooking/services/bookingService");
const {
  retryPendingRefunds,
} = require("../../app/busboooking/services/refundService");

let running = false;

async function runStep(name, step) {
  try {
    const count = await step();
    if (count) console.log(`[BusBooking][cron] ${name}: ${count}`);
  } catch (error) {
    console.error(`[BusBooking][cron] ${name} failed`, error.message);
  }
}

// Every minute: seat holds are short, so a paid order the app abandoned has
// to be booked (or refunded) well inside the provider's hold window.
cron.schedule("* * * * *", async () => {
  if (running) return;
  running = true;

  try {
    await runStep("expired seat holds", expireStaleBlocks);
    await runStep("abandoned paid orders booked", bookAbandonedPaidOrders);
    await runStep("stuck bookings escalated", escalateStuckBookings);
    await runStep("refunds retried", retryPendingRefunds);
    await cronPing("busbooking_reconcile_cron");
  } finally {
    running = false;
  }
});
