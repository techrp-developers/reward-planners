function validateDiscount(type, value) {
  const amount = Number(value);
  if (!['none', 'percentage', 'fixed'].includes(type) ||
      (type !== 'none' && (!Number.isFinite(amount) || amount <= 0 || amount > 9999999999.99 || (type === 'percentage' && amount > 100)))) {
    const error = new Error('Choose no discount, a percentage from 0.01 to 100, or a positive fixed amount');
    error.statusCode = 400;
    throw error;
  }
  if (type !== 'none' && Math.round(amount * 100) / 100 !== amount) {
    const error = new Error('Discount value supports at most two decimal places'); error.statusCode = 400; throw error;
  }
  return { discount_type: type, discount_value: type === 'none' ? 0 : amount };
}
module.exports = { validateDiscount };
