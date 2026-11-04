const {test}=require('node:test');
const assert=require('node:assert/strict');
const {canonicalRequest,toCents,assertBinding}=require('../utils/checkoutPolicy');
const session={sessionId:'session-a',userId:12};
const cart=[{variantId:3,qty:1,pointsApplied:0},{variantId:1,qty:2,pointsApplied:1}];
const payment={method:'cash',amount:'10.25',confirmed:true};
test('checkout fingerprint ignores ordering but binds cart, event, customer and session',()=>{
  const hash=canonicalRequest(session,1,cart,payment).hash;
  assert.equal(hash,canonicalRequest(session,1,[...cart].reverse(),payment).hash);
  for (const [s,event,items] of [[session,2,cart],[{...session,userId:13},1,cart],[{...session,sessionId:'session-b'},1,cart],[session,1,[{...cart[0],qty:2},cart[1]]]]) assert.notEqual(hash,canonicalRequest(s,event,items,payment).hash);
});
test('duplicate variants, invalid amounts, and absent cashier confirmation are rejected',()=>{
  assert.throws(()=>canonicalRequest(session,1,[cart[0],cart[0]],payment),/duplicate/);
  for (const amount of ['-1','NaN','1.001','1e3','']) assert.throws(()=>toCents(amount));
  assert.equal(toCents('0.10'),10); assert.equal(toCents('123.45'),12345);
  assert.throws(()=>canonicalRequest(session,1,cart,{...payment,confirmed:false}),/confirmation/);
});
test('another customer session cannot replay a completed checkout',()=>{
  assert.throws(()=>assertBinding({session_id:'session-a'},'session-b'),/another customer/);
  assert.doesNotThrow(()=>assertBinding({session_id:'session-a'},'session-a'));
});
test('electronic confirmation is disabled by default and never silently provider verified',()=>{
  const previous=process.env.FLEA_MARKET_ALLOW_MANUAL_ELECTRONIC;
  try {
    delete process.env.FLEA_MARKET_ALLOW_MANUAL_ELECTRONIC;
    assert.throws(()=>canonicalRequest(session,1,cart,{...payment,method:'upi',reference:'real-bank-reference'}),/not configured/);
    process.env.FLEA_MARKET_ALLOW_MANUAL_ELECTRONIC='true';
    assert.throws(()=>canonicalRequest(session,1,cart,{...payment,method:'upi'}),/reference/);
  } finally { if (previous===undefined) delete process.env.FLEA_MARKET_ALLOW_MANUAL_ELECTRONIC; else process.env.FLEA_MARKET_ALLOW_MANUAL_ELECTRONIC=previous; }
});
