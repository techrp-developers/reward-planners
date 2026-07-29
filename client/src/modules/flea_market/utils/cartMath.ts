import type { FleaMarketProduct } from "../api/fleaMarketProductsApi";

/* ================= TYPES ================= */

export interface CartLine {
  product: FleaMarketProduct;
  quantity: number;
  pointsApplied: number;
  // Fetched per-item from GET /products/:variantId/reward-eligibility when the
  // product is added — never assumed/reused from a prior addition, since
  // reward rules can be time-bound or promotional.
  maxRedeemablePoints: number;
  canRedeem: boolean;
  eligibilityLoading?: boolean;
}

/* ================= CROSS-LINE POINTS HELPERS ================= */
// A cart-wide points budget (the customer's reward balance) is shared across
// every line, each of which also has its own cap (maxRedeemablePoints * qty).
// These are pure functions so BillingPage (the state owner) and Cart (the
// renderer) both compute against the same rules.

// Re-clamps every line against its own cap and the shared balance, in cart
// order. Used after quantity/removal changes, where a line's own cap may
// have shrunk out from under its currently-applied points.
export function clampCartLines(lines: CartLine[], pointsBalance: number): CartLine[] {
  let remaining = pointsBalance;

  return lines.map((line) => {
    const lineCap = line.canRedeem ? line.maxRedeemablePoints * line.quantity : 0;
    const applied = Math.max(0, Math.min(line.pointsApplied, lineCap, remaining));
    remaining -= applied;
    return applied === line.pointsApplied ? line : { ...line, pointsApplied: applied };
  });
}

// Applies a user-edited points value to one line, capped by that line's own
// redeemable limit AND whatever balance remains after every other line's
// currently-applied points — so the cart-wide total can never exceed the
// customer's balance.
export function updateLinePoints(
  lines: CartLine[],
  variantId: number,
  rawValue: number,
  pointsBalance: number,
): CartLine[] {
  const othersApplied = lines
    .filter((line) => line.product.variantId !== variantId)
    .reduce((sum, line) => sum + line.pointsApplied, 0);
  const budgetForThisLine = Math.max(0, pointsBalance - othersApplied);
  const safeValue = Number.isFinite(rawValue) ? rawValue : 0;

  return lines.map((line) => {
    if (line.product.variantId !== variantId) return line;
    if (!line.canRedeem) return line;
    const lineCap = line.maxRedeemablePoints * line.quantity;
    const clamped = Math.max(0, Math.min(safeValue, lineCap, budgetForThisLine));
    return { ...line, pointsApplied: clamped };
  });
}

export function getLineMaxRedeemable(lines: CartLine[], variantId: number, pointsBalance: number): number {
  const line = lines.find((l) => l.product.variantId === variantId);
  if (!line || !line.canRedeem) return 0;

  const othersApplied = lines
    .filter((l) => l.product.variantId !== variantId)
    .reduce((sum, l) => sum + l.pointsApplied, 0);
  const budgetForThisLine = Math.max(0, pointsBalance - othersApplied);
  const lineCap = line.maxRedeemablePoints * line.quantity;

  return Math.min(lineCap, budgetForThisLine);
}

export function getCartTotals(lines: CartLine[]) {
  const totalMrp = lines.reduce((sum, line) => sum + line.product.mrp * line.quantity, 0);
  const totalSellingPrice = lines.reduce((sum, line) => sum + line.product.salePrice * line.quantity, 0);
  const totalPointsRedeemed = lines.reduce((sum, line) => sum + line.pointsApplied, 0);
  const finalPayable = Math.max(totalSellingPrice - totalPointsRedeemed, 0);

  return { totalMrp, totalSellingPrice, totalPointsRedeemed, finalPayable };
}

/* ================= VENDOR SPLIT PREVIEW ================= */
// Checkout splits the cart into one invoice per vendor server-side — this
// mirrors that grouping client-side so the operator sees "this will generate
// N invoices" before clicking checkout, not as a surprise after.

export interface VendorGroup {
  vendorId: number;
  lines: CartLine[];
  subtotal: number;
}

export function getVendorGroups(lines: CartLine[]): VendorGroup[] {
  const groups = new Map<number, CartLine[]>();

  for (const line of lines) {
    const existing = groups.get(line.product.vendorId);
    if (existing) {
      existing.push(line);
    } else {
      groups.set(line.product.vendorId, [line]);
    }
  }

  return Array.from(groups.entries()).map(([vendorId, groupLines]) => ({
    vendorId,
    lines: groupLines,
    subtotal: groupLines.reduce((sum, line) => sum + line.product.salePrice * line.quantity, 0),
  }));
}
