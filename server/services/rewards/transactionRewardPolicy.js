const MODULES = ["bbps", "busbooking"];

function validateSettings(body) {
  if (!Array.isArray(body?.ranges) || body.ranges.length > 100) throw new Error("Provide up to 100 ranges.");
  const expiryDays = Number(body.expiry_days);
  if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 3650) throw new Error("Expiry must be 1–3650 days.");
  const amount = value => {
    if (value === "" || value == null || typeof value === "boolean") throw new Error("Enter a valid amount.");
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 99999999.99 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001) throw new Error("Amounts must be positive, with at most two decimal places.");
    return n;
  };
  const ranges = body.ranges.map(row => {
    const min = amount(row.min);
    const max = row.max === null || row.max === "" ? null : amount(row.max);
    const points = Number(row.points);
    if (max !== null && max <= min) throw new Error("Upper amount must be greater than the lower amount.");
    if (!Number.isInteger(points) || points < 1 || points > 1000000) throw new Error("Points must be a whole number from 1 to 1,000,000.");
    return { min, max, points };
  }).sort((a, b) => a.min - b.min);
  ranges.forEach((row, i) => {
    if (i && (ranges[i - 1].max === null || row.min < ranges[i - 1].max)) throw new Error("Amount ranges must not overlap.");
  });
  return { ranges, expiry_days: expiryDays };
}

function rewardForAmount(ranges, amount) {
  const paid = Number(amount);
  if (!Number.isFinite(paid) || paid <= 0) return 0;
  return ranges.find(row => paid >= row.min && (row.max === null || paid < row.max))?.points || 0;
}

module.exports = { MODULES, validateSettings, rewardForAmount };
