const JOBS = [
  '../services/Bbps/retryCron', '../services/Bbps/refundCron',
  '../services/Razorpay/retryCron', '../services/Maintenance/maintenanceCron',
  '../services/Razorpay/orderExpiryCron', '../services/BusBooking/reconcileCron',
  '../services/Todo/todoReminderCron', '../services/Todo/birthdayReminderCron',
  '../services/Ecommerce/cartRecoveryCron', '../services/Todo/fitnessGoalHookCron',
  '../services/Todo/accountPurgeCron', '../services/Notifications/campaignWorkerCron',
];

function localJobsEnabled(env) {
  // Production scheduling must not be affected by a local-development switch.
  const mode = String(env.NODE_ENV || '').toLowerCase();
  if (!['development', 'test'].includes(mode)) return true;
  return env.ENABLE_LOCAL_SCHEDULED_JOBS === 'true' &&
    String(env.RUN_SCHEDULED_JOBS ?? 'true').toLowerCase() === 'true';
}

function startScheduledJobs(env = process.env, load = require, logger = console) {
  if (!localJobsEnabled(env)) {
    logger.info('[scheduler] Local scheduled jobs disabled. Set ENABLE_LOCAL_SCHEDULED_JOBS=true to opt in.');
    return [];
  }
  const jobs = [...JOBS];
  // Preserve the pre-existing production switch for these two jobs only.
  if (String(env.RUN_SCHEDULED_JOBS ?? 'true').toLowerCase() === 'true') {
    jobs.unshift('../services/ExpressBees/cron/shipmentCron', '../services/Status/statusCleanupCron');
  }
  jobs.forEach(job => load(job));
  return jobs;
}
module.exports = { localJobsEnabled, startScheduledJobs };
