const CAMPAIGN_WORKER_JOB = '../services/Notifications/campaignWorkerCron';
const JOBS = [
  '../services/Bbps/retryCron', '../services/Bbps/refundCron',
  '../services/Razorpay/retryCron', '../services/Maintenance/maintenanceCron',
  '../services/Razorpay/orderExpiryCron', '../services/BusBooking/reconcileCron',
  '../services/Todo/todoReminderCron', '../services/Todo/birthdayReminderCron',
  '../services/Ecommerce/cartRecoveryCron', '../services/Todo/fitnessGoalHookCron',
  '../services/Todo/accountPurgeCron', CAMPAIGN_WORKER_JOB,
];

const isLocalMode = (env) => ['development', 'test'].includes(String(env.NODE_ENV || '').toLowerCase());

function localJobsEnabled(env) {
  // Production scheduling must not be affected by a local-development switch.
  if (!isLocalMode(env)) return true;
  return env.ENABLE_LOCAL_SCHEDULED_JOBS === 'true' &&
    String(env.RUN_SCHEDULED_JOBS ?? 'true').toLowerCase() === 'true';
}

// Local QA of RM campaigns needs the campaign worker without also starting
// birthday wishes, cart recovery, payment retries and the other jobs.
function campaignWorkerEnabled(env) {
  return localJobsEnabled(env) || (isLocalMode(env) && env.ENABLE_LOCAL_CAMPAIGN_WORKER === 'true');
}

// What this process actually started, as opposed to what the environment
// asks for: the dashboard reports this, so a flag set after startup (or a job
// that failed to load) never shows as a running worker.
const runtime = { campaignWorkerStarted: false, campaignWorkerStartedAt: null, mode: 'off' };
const campaignWorkerRuntime = () => ({ ...runtime });

function loadJobs(jobs, load) {
  jobs.forEach(job => load(job));
  if (jobs.includes(CAMPAIGN_WORKER_JOB)) {
    runtime.campaignWorkerStarted = true;
    runtime.campaignWorkerStartedAt = new Date().toISOString();
  }
  return jobs;
}

function startScheduledJobs(env = process.env, load = require, logger = console) {
  if (!localJobsEnabled(env)) {
    if (campaignWorkerEnabled(env)) {
      logger.info('[scheduler] Local scheduled jobs disabled; campaign worker only (ENABLE_LOCAL_CAMPAIGN_WORKER=true).');
      runtime.mode = 'campaign_worker_only';
      return loadJobs([CAMPAIGN_WORKER_JOB], load);
    }
    logger.info('[scheduler] Local scheduled jobs disabled. Set ENABLE_LOCAL_SCHEDULED_JOBS=true to opt in.');
    return [];
  }
  const jobs = [...JOBS];
  // Preserve the pre-existing production switch for these two jobs only.
  if (String(env.RUN_SCHEDULED_JOBS ?? 'true').toLowerCase() === 'true') {
    jobs.unshift('../services/ExpressBees/cron/shipmentCron', '../services/Status/statusCleanupCron');
  }
  runtime.mode = 'all_jobs';
  return loadJobs(jobs, load);
}
module.exports = { CAMPAIGN_WORKER_JOB, campaignWorkerEnabled, campaignWorkerRuntime, localJobsEnabled, startScheduledJobs };
