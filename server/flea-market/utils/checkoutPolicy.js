const crypto = require('crypto');
const { createError } = require('./appError');
const id = value => Number.isSafeInteger(Number(value)) && Number(value)>0;
function canonicalRequest(session,scheduleId,items,payment) {
  if (!id(scheduleId) || !Array.isArray(items) || !items.length) throw createError(400,'Select an event and add items');
  const seen = new Set();
  const cart = items.map(item=>{
    if (!id(item.variantId) || !id(item.qty) || !Number.isSafeInteger(Number(item.pointsApplied)) || Number(item.pointsApplied)<0) throw createError(400,'Invalid cart quantity or points');
    const variantId=Number(item.variantId);
    if (seen.has(variantId)) throw createError(400,'Combine duplicate variants into one cart line');
    seen.add(variantId);
    return {variantId,qty:Number(item.qty),pointsApplied:Number(item.pointsApplied)};
  }).sort((a,b)=>a.variantId-b.variantId);
  if (!payment || !['cash','card','upi'].includes(payment.method) || payment.confirmed !== true) throw createError(400,'Explicit cashier payment confirmation is required');
  if (payment.method!=='cash' && process.env.FLEA_MARKET_ALLOW_MANUAL_ELECTRONIC !== 'true') throw createError(409,'Electronic payment confirmation is not configured; use a trusted provider adapter or enable audited manual confirmation');
  const reference = String(payment.reference||'').trim();
  if (reference.length>190 || (payment.method!=='cash' && !reference)) throw createError(400,'A valid payment reference is required');
  const amountCents=toCents(payment.amount);
  const hash=crypto.createHash('sha256').update(JSON.stringify({sessionId:session.sessionId,customerId:session.userId,scheduleId:Number(scheduleId),items:cart,payment:{method:payment.method,reference,amountCents}})).digest('hex');
  return {cart,hash,amountCents,reference,method:payment.method};
}
function toCents(value) {
  if (!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(String(value))) throw createError(400,'Amount must be a non-negative decimal with at most two places');
  const [whole,fraction=''] = String(value).split('.');
  return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}
function assertBinding(existing,sessionId) {
  if (existing.session_id!==sessionId) throw createError(409,'Checkout key belongs to another customer session');
}
module.exports={canonicalRequest,toCents,assertBinding};
