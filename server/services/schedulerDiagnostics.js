const { monitorEventLoopDelay } = require('node:perf_hooks');

// Opt-in measurement: missed cron ticks alone do not establish a CPU/I/O cause.
function startSchedulerDiagnostics(env = process.env, logger = console) {
  if (env.SCHEDULER_DIAGNOSTICS !== 'true') return () => {};
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();
  let previous = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    const elapsed = now - previous;
    previous = now;
    const maxMs = histogram.max / 1e6;
    if (maxMs > 1000 || elapsed > 65000) {
      logger.warn('[scheduler] Event-loop delay sample', {
        elapsedMs: elapsed, maxDelayMs: Math.round(maxMs),
        p99DelayMs: Math.round(histogram.percentile(99) / 1e6),
        note: 'Host suspension and process pauses can also cause delayed ticks',
      });
    }
    histogram.reset();
  }, 60000);
  timer.unref();
  return () => { clearInterval(timer); histogram.disable(); };
}
module.exports = { startSchedulerDiagnostics };
