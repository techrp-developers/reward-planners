const {test}=require('node:test');
const assert=require('node:assert/strict');
const {localJobsEnabled,startScheduledJobs}=require('../config/scheduledJobs');
const {createReconcileRunner}=require('../services/BusBooking/reconcileRunner');

test('local schedulers require explicit opt-in and register no jobs by default',()=>{
  assert.equal(localJobsEnabled({NODE_ENV:'development'}),false);
  assert.equal(localJobsEnabled({NODE_ENV:'development',RUN_SCHEDULED_JOBS:'true'}),false);
  assert.equal(localJobsEnabled({NODE_ENV:'development',ENABLE_LOCAL_SCHEDULED_JOBS:'true'}),true);
  assert.equal(localJobsEnabled({NODE_ENV:'development',ENABLE_LOCAL_SCHEDULED_JOBS:'true',RUN_SCHEDULED_JOBS:'false'}),false);
  assert.deepEqual(startScheduledJobs({NODE_ENV:'development'},()=>assert.fail('Job loaded'),{info(){}}),[]);
});
test('production jobs are not disabled by the local-development toggle',()=>{
  const loaded=[];
  startScheduledJobs({NODE_ENV:'production',ENABLE_LOCAL_SCHEDULED_JOBS:'false',RUN_SCHEDULED_JOBS:'false'},job=>loaded.push(job));
  assert.ok(loaded.includes('../services/BusBooking/reconcileCron'));
  assert.ok(loaded.includes('../services/Bbps/refundCron'));
  assert.ok(!loaded.includes('../services/Status/statusCleanupCron'));
});
test('reconciliation skips overlap, releases guard, and only heartbeats successful runs',async()=>{
  let release;
  const waiting=new Promise(resolve=>{release=resolve;});
  let pings=0;
  const run=createReconcileRunner({steps:[['work',async()=>waiting]],ping:async()=>{pings++;}});
  const first=run();
  assert.deepEqual(await run(),{skipped:true});
  release();await first;
  await run();assert.equal(pings,2);
  const errors=[];
  const failure=createReconcileRunner({steps:[['failure',async()=>{throw new Error('Schema mismatch');}]],ping:()=>assert.fail('False healthy heartbeat'),logger:{error:x=>errors.push(x)}});
  assert.equal((await failure()).failed,1);assert.equal(errors.length,1);
});
