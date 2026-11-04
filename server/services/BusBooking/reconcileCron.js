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

const { createReconcileRunner } = require('./reconcileRunner');
const run = createReconcileRunner({
  steps: [
    ['expired seat holds', expireStaleBlocks],
    ['abandoned paid orders booked', bookAbandonedPaidOrders],
    ['stuck bookings escalated', escalateStuckBookings],
    ['refunds retried', retryPendingRefunds],
  ],
  ping: cronPing,
});

// Keep the existing minute cadence; never overlap slow provider/refund runs.
const task = cron.schedule('* * * * *', run, {
  name: 'busbooking-reconcile', noOverlap: true,
});
task.on('execution:missed', context => {
  console.warn('[BusBooking][cron] Missed scheduled tick', {scheduledAt: context.date});
});
module.exports = { task, run };
