function invalid(message, status = 400) { return Object.assign(new Error(message), { status }); }
function id(value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) throw invalid('A valid record ID is required.');
  return Number(value);
}
function text(value, label, max = 255, required = true) {
  if (value != null && typeof value !== 'string') throw invalid(`${label} must be text.`);
  const result = String(value ?? '').trim();
  if ((required && !result) || result.length > max) throw invalid(`${label} must contain ${required ? '1' : '0'}–${max} characters.`);
  return result;
}
// Parse decimal input without binary floating point in commercial writes.
function cents(value) {
  if (!/^(0|[1-9]\d{0,7})(\.\d{1,2})?$/.test(String(value))) throw invalid('Enter a non-negative amount with up to two decimal places (maximum 99,999,999.99).');
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
function money(value) { const n = cents(value); return `${n / 100n}.${String(n % 100n).padStart(2, '0')}`; }
function integer(value, max = 1000000) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw invalid(`Enter a whole number from 0 to ${max}.`);
  return Number(value);
}
function status(value) { if (![0, 1, '0', '1'].includes(value)) throw invalid('Status must be active or inactive.'); return Number(value); }
function dates(query) {
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  for (const key of ['from', 'to']) if (query[key] && !valid(query[key])) throw invalid('Use valid YYYY-MM-DD dates.');
  if (query.from && query.to && query.from > query.to) throw invalid('Start date must be before end date.');
  return { from: query.from || null, to: query.to || null };
}
function page(query) { return { page: query.page ? id(query.page) : 1, limit: query.limit ? Math.min(id(query.limit), 100) : 20 }; }
function price(body) {
  const regular = money(body.original_price), selling = money(body.price);
  if (cents(selling) > cents(regular)) throw invalid('Selling price cannot exceed regular price.');
  return { original_price: regular, price: selling };
}
function rewards(body) {
  if (!['none','earn','redeem','both'].includes(body.mode)) throw invalid('Choose an existing reward mode.');
  const result = { can_earn_reward: ['earn','both'].includes(body.mode) ? 1 : 0, can_redeem_reward: ['redeem','both'].includes(body.mode) ? 1 : 0 };
  for (const [type, value, cap] of [['earn_reward_type','earn_reward_value','max_earn_reward'], ['redemption_type','redemption_value','max_redemption_amount']]) {
    if (!['fixed','percentage'].includes(body[type])) throw invalid('Reward type must be fixed or percentage.');
    result[type] = body[type]; result[value] = money(body[value]);
    result[cap] = body[cap] === '' || body[cap] == null ? null : money(body[cap]);
    if (body[type] === 'percentage' && cents(body[value]) > 10000n) throw invalid('Reward percentages cannot exceed 100.');
    if (body[type] === 'fixed' && cents(body[value]) % 100n) throw invalid('Fixed rewards must be whole coins.');
    if (result[cap] !== null && cents(result[cap]) % 100n) throw invalid('Reward caps must be whole coins.');
  }
  return result;
}
function transition(order, next) {
  if (order.status === next) return;
  if (order.payment_status !== 'paid') throw invalid('Only paid orders can move through fulfilment.',409);
  const allowed={documents_uploaded:['in_progress'],in_progress:['completed']};
  if (!(allowed[order.status]||[]).includes(next)) throw invalid('Invalid fulfilment transition. Use the cancellation review workflow for cancellations.',409);
}
module.exports = { invalid, id, text, cents, money, integer, status, dates, page, price, rewards, transition };
