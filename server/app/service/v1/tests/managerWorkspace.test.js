const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../utils/managerPolicy');
const {createWorkspaceModel}=require('../models/managerWorkspaceModel');
const {updateManagerOrderStatus}=require('../utils/managerOrderStatus');
test('commercial amounts use exact decimal parsing and reject malformed or excessive prices',()=>{
  assert.equal(P.money('12345678.99'),'12345678.99');
  assert.equal(P.cents('0.29'),29n);
  for(const value of ['-1','1e3','Infinity','1.001','100000000.00',null,true,''])assert.throws(()=>P.money(value));
  assert.deepEqual(P.price({original_price:'500',price:'450.25'}),{original_price:'500.00',price:'450.25'});
  assert.throws(()=>P.price({original_price:'500',price:'501'}));
});
test('dates reject invalid calendar values and reversed ranges',()=>{
  for(const query of [{from:'2026-02-30'},{to:'no'},{from:'2026-11-17',to:'2026-11-01'}])assert.throws(()=>P.dates(query));
  assert.equal(P.dates({from:'2024-02-29'}).from,'2024-02-29');
});
test('rewards reject ambiguous modes, fractional fixed coins, and percentage overflow',()=>{
  const rule={mode:'both',earn_reward_type:'fixed',earn_reward_value:'20',max_earn_reward:'',redemption_type:'percentage',redemption_value:'10',max_redemption_amount:'50'};
  assert.equal(P.rewards(rule).can_redeem_reward,1);
  for(const override of [{mode:'direct_rp'},{earn_reward_value:'1.25'},{redemption_value:'101'},{max_redemption_amount:'1.5'}])assert.throws(()=>P.rewards({...rule,...override}));
});
test('fulfilment cannot fabricate payment or bypass cancellation review',()=>{
  P.transition({status:'documents_uploaded',payment_status:'paid'},'in_progress');
  P.transition({status:'in_progress',payment_status:'paid'},'completed');
  for(const [current,payment,next] of [['pending_payment','pending','completed'],['documents_pending','paid','completed'],['in_progress','paid','cancelled'],['completed','paid','in_progress']])assert.throws(()=>P.transition({status:current,payment_status:payment},next));
});
const variant={id:2,service_id:8,variant_name:'Standard',price:'500.00',original_price:'600.00',status:1};
function harness({scope='in_house',auditFailure=false}={}){
  const calls=[];
  const conn={
    beginTransaction:async()=>calls.push('begin'),commit:async()=>calls.push('commit'),rollback:async()=>calls.push('rollback'),release:()=>calls.push('release'),
    execute:async(sql,args)=>{calls.push({sql,args});if(sql.startsWith('SELECT * FROM service_variants'))return [[variant]];if(sql.startsWith('SELECT service_scope'))return [[{service_scope:scope}]];if(sql.startsWith('INSERT INTO service_manager_audit_logs')&&auditFailure)throw new Error('audit unavailable');return [{affectedRows:1}];},
  };
  return {calls,model:createWorkspaceModel({getConnection:async()=>conn,execute:async()=>[[{COLUMN_TYPE:"enum('SERVICE_REWARD')"}]]})};
}
test('price change records actor and both snapshots without updating historical orders',async()=>{
  const {model,calls}=harness();
  await model.commercial(2,{original_price:'600',price:'450',version:JSON.stringify(variant),reason:'New rate'},35,'pricing');
  assert.ok(calls.includes('commit'));assert.ok(!calls.includes('rollback'));
  const writes=calls.filter(call=>typeof call==='object'&&/^(UPDATE|INSERT)/.test(call.sql));
  assert.equal(writes.length,2);
  assert.ok(writes[0].sql.startsWith('UPDATE service_variants'));
  assert.equal(writes[1].args[0],35);
  assert.equal(JSON.parse(writes[1].args[5]).price,'500.00');
  assert.equal(JSON.parse(writes[1].args[6]).price,'450.00');
  assert.ok(!writes.some(call=>/service_orders|wallet/.test(call.sql)));
});
test('stale price saves roll back instead of overwriting a concurrent edit',async()=>{
  const {model,calls}=harness();
  await assert.rejects(model.commercial(2,{original_price:'600',price:'450',version:'stale',reason:'New rate'},35,'pricing'),error=>error.status===409);
  assert.ok(calls.includes('rollback'));assert.ok(!calls.includes('commit'));
  assert.ok(!calls.some(call=>typeof call==='object'&&call.sql.startsWith('UPDATE service_variants')));
});
test('partner variants cannot be repriced by In-House APIs',async()=>{
  const {model,calls}=harness({scope:'partner'});
  await assert.rejects(model.commercial(2,{original_price:'600',price:'450',version:JSON.stringify(variant),reason:'New rate'},35,'pricing'),error=>error.status===403);
  assert.ok(calls.includes('rollback'));
});
test('audit persistence failure rolls back the commercial change',async()=>{
  const {model,calls}=harness({auditFailure:true});
  await assert.rejects(model.commercial(2,{original_price:'600',price:'450',version:JSON.stringify(variant),reason:'New rate'},35,'pricing'),/audit unavailable/);
  assert.ok(calls.includes('rollback'));assert.ok(!calls.includes('commit'));assert.equal(calls.at(-1),'release');
});
test('new reward activations remain disabled pending policy review',async()=>{
  const {model,calls}=harness();
  await assert.rejects(model.commercial(2,{mode:'earn',earn_reward_type:'fixed',earn_reward_value:'20',max_earn_reward:'',redemption_type:'fixed',redemption_value:'0',max_redemption_amount:'',policy_acknowledged:true,reason:'Attempt new activation',version:JSON.stringify(variant)},35,'rewards'),error=>error.status===409&&error.message.includes('policy review'));
  assert.ok(calls.includes('rollback'));
});
test('missing workspace migration returns actionable failure, not empty metrics',async()=>{
  await assert.rejects(createWorkspaceModel({execute:async()=>[[]]}).ready(),error=>error.status===503);
});
test('scope query input cannot select arbitrary workspaces or SQL fragments',async()=>{
  await assert.rejects(createWorkspaceModel({}).list('variants',{scope:"partner' OR 1=1"}),error=>error.status===400);
  assert.throws(()=>P.id('1 OR 1=1'));assert.throws(()=>P.status('active'));
});
test('completion with unsupported wallet schema cannot save status or issue coins',async()=>{
  const writes=[];let rolledBack=false;
  const conn={beginTransaction:async()=>{},commit:async()=>assert.fail('must not commit'),rollback:async()=>{rolledBack=true;},release:()=>{},execute:async(sql)=>{
    if(sql.includes('SELECT o.*'))return [[{id:2,user_id:7,status:'in_progress',payment_status:'paid',reward_coins_earned:'20'}]];
    if(sql.includes('SELECT id FROM service_order_cancellations'))return [[]];
    if(sql.includes('COLUMN_TYPE'))return [[{COLUMN_TYPE:"enum('ORDER_REWARD')"}]];
    writes.push(sql);return [{}];
  }};
  await assert.rejects(updateManagerOrderStatus({getConnection:async()=>conn},35,2,'completed'),error=>[409,503].includes(error.status));
  assert.equal(rolledBack,true);assert.deepEqual(writes,[]);
});
test('a repeated completed transition does not issue another award',async()=>{
  let committed=false;const queries=[];
  const conn={beginTransaction:async()=>{},commit:async()=>{committed=true;},rollback:async()=>{},release:()=>{},execute:async(sql)=>{queries.push(sql);return [[{id:2,status:'completed',payment_status:'paid',user_id:7,reward_coins_earned:'20'}]];}};
  const result=await updateManagerOrderStatus({getConnection:async()=>conn},35,2,'completed');
  assert.equal(result.changed,false);assert.equal(committed,true);assert.equal(queries.length,1);
});
