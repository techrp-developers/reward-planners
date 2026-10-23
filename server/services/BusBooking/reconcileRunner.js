// Injected dependencies keep scheduling tests away from real booking/refund APIs.
function createReconcileRunner({ steps, ping, logger = console, clock = Date.now }) {
  let running = false;
  return async function reconcile() {
    if (running) return { skipped: true };
    running = true;
    const started = clock();
    let failed = 0;
    try {
      for (const [name, step] of steps) {
        try {
          const count = await step();
          if (count) logger.info(`[BusBooking][cron] ${name}: ${count}`);
        } catch (error) {
          failed += 1;
          logger.error(`[BusBooking][cron] ${name} failed: ${error.message}`);
        }
      }
      // A failed reconciliation must not advertise a successful heartbeat.
      if (!failed) await ping('busbooking_reconcile_cron');
      const durationMs = clock() - started;
      if (durationMs > 60000) logger.warn(`[BusBooking][cron] Run took ${durationMs}ms; overlapping runs are skipped`);
      return { failed, durationMs };
    } finally { running = false; }
  };
}
module.exports = { createReconcileRunner };
