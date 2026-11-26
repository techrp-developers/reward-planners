const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
// Evaluate the real legacy model with inert external dependencies; no gateway,
// notification provider or persistent database is contacted.
const exported={exports:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../models/serviceOrderModel.js'),'utf8'),{
  module:exported,console,
  require:name=>name.endsWith('/orderOffer')?{orderOfferColumns:()=>'',orderOffer:()=>null}:name.endsWith('/notification')?{notifyUser:()=>{}}:{},
});
const model=exported.exports;
function connection(status='requested',failAudit=false){const calls=[];return {calls,execute:async(sql,args)=>{
  calls.push({sql,args});
  if(sql.includes('SELECT')&&sql.includes('FROM service_order_cancellations'))return [[{id:1,status,user_id:7}]];
  if(failAudit&&sql.includes('INSERT INTO service_manager_audit_logs'))throw new Error('audit unavailable');
  return [{affectedRows:1}];
}};}
test('manager cancellation rejection records its actor and decision on the caller transaction',async()=>{
  const conn=connection();await model.rejectCancellation(4,conn,35);
  const audit=conn.calls.find(call=>call.sql.includes('INSERT INTO service_manager_audit_logs'));
  assert.equal(audit.args[0],35);assert.equal(audit.args[1],4);
  assert.equal(JSON.parse(audit.args[2]).status,'requested');assert.equal(JSON.parse(audit.args[3]).status,'rejected');
});
test('existing non-service-manager callers retain the optional audit contract',async()=>{
  const conn=connection();await model.rejectCancellation(4,conn);
  assert.equal(conn.calls.some(call=>call.sql.includes('service_manager_audit_logs')),false);
});
test('duplicate cancellation decisions cannot produce another update or audit',async()=>{
  const conn=connection('rejected');await assert.rejects(model.rejectCancellation(4,conn,35),/INVALID_CANCELLATION_STATE/);
  assert.equal(conn.calls.length,1);
});
test('audit failure propagates so the owning cancellation controller can roll back',async()=>{
  await assert.rejects(model.rejectCancellation(4,connection('requested',true),35),/audit unavailable/);
});
