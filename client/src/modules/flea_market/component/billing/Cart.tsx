import { memo, useMemo } from "react";
import { FiAlertCircle, FiAward, FiMinus, FiPlus, FiShoppingCart, FiTrash2 } from "react-icons/fi";
import type { FleaMarketCustomer } from "../../api/fleaMarketOtpApi";
import { getCartTotals, getLineMaxRedeemable, getVendorGroups, type CartLine } from "../../utils/cartMath";
import SectionCard from "../ui/SectionCard";
import { EmptyState, ErrorState } from "../ui/EmptyState";

/* ================= TYPES ================= */

interface CartProps {
  customer: FleaMarketCustomer;
  lines: CartLine[];
  onIncrement: (variantId: number) => void;
  onDecrement: (variantId: number) => void;
  onRemove: (variantId: number) => void;
  onPointsChange: (variantId: number, rawValue: number) => void;
  onCheckout: () => void;
  checkingOut: boolean;
  checkoutError?: string;
}

interface CartLineItemProps {
  line: CartLine;
  lineMaxRedeemable: number;
  onIncrement: (variantId: number) => void;
  onDecrement: (variantId: number) => void;
  onRemove: (variantId: number) => void;
  onPointsChange: (variantId: number, rawValue: number) => void;
}

/* ================= LINE ITEM ================= */
// Split out and memoized so editing one line's redemption doesn't re-render
// every other line in a large multi-item cart.
const CartLineItem = memo(function CartLineItem({
  line,
  lineMaxRedeemable,
  onIncrement,
  onDecrement,
  onRemove,
  onPointsChange,
}: CartLineItemProps) {
  return (
    <div className="p-3 transition-colors border border-gray-100 rounded-xl hover:border-gray-200">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-800 truncate">{line.product.name}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {line.product.brand ?? "—"} · {line.product.sku}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 px-2 py-1 border border-gray-200 rounded-lg">
            <button
              type="button"
              onClick={() => onDecrement(line.product.variantId)}
              aria-label={`Decrease quantity of ${line.product.name}`}
              className="text-gray-500 hover:text-gray-700"
            >
              <FiMinus className="w-3.5 h-3.5" />
            </button>
            <span className="text-sm font-bold text-gray-800 w-5 text-center">{line.quantity}</span>
            <button
              type="button"
              onClick={() => onIncrement(line.product.variantId)}
              aria-label={`Increase quantity of ${line.product.name}`}
              className="text-gray-500 hover:text-gray-700"
            >
              <FiPlus className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="w-24 text-right">
            <p className="text-sm font-bold text-gray-900">
              ₹{(line.product.salePrice * line.quantity).toLocaleString()}
            </p>
            {line.product.mrp !== line.product.salePrice && (
              <p className="text-[11px] text-gray-400 line-through">
                ₹{(line.product.mrp * line.quantity).toLocaleString()}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => onRemove(line.product.variantId)}
            aria-label={`Remove ${line.product.name} from bill`}
            className="text-gray-400 hover:text-red-600"
          >
            <FiTrash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Per-line points redemption */}
      <div className="flex items-center gap-2 mt-2">
        <FiAward className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        {line.eligibilityLoading ? (
          <span className="text-[11px] text-gray-400">Checking reward eligibility...</span>
        ) : line.canRedeem ? (
          <>
            <input
              type="checkbox"
              checked={line.pointsApplied > 0}
              onChange={(e) => onPointsChange(line.product.variantId, e.target.checked ? lineMaxRedeemable : 0)}
              disabled={lineMaxRedeemable === 0}
              title={
                lineMaxRedeemable === 0
                  ? "No reward points available to redeem for this line"
                  : "Redeem the maximum allowed for this line"
              }
              className="w-3.5 h-3.5 shrink-0 accent-amber-500 disabled:opacity-40"
            />
            <input
              type="number"
              min={0}
              max={lineMaxRedeemable}
              value={line.pointsApplied}
              disabled={lineMaxRedeemable === 0}
              onChange={(e) => onPointsChange(line.product.variantId, Number(e.target.value))}
              className="w-24 px-2 py-1 text-xs bg-white border border-amber-200 rounded-lg outline-none disabled:bg-gray-50 disabled:opacity-60"
            />
            <span className="text-[11px] text-gray-400">
              pts redeemed · up to {lineMaxRedeemable.toLocaleString()} for this line
            </span>
          </>
        ) : (
          <span className="text-[11px] font-semibold text-gray-400">Not eligible for point redemption</span>
        )}
      </div>
    </div>
  );
});

/* ================= COMPONENT ================= */

function Cart({
  customer,
  lines,
  onIncrement,
  onDecrement,
  onRemove,
  onPointsChange,
  onCheckout,
  checkingOut,
  checkoutError,
}: CartProps) {
  const { totalMrp, totalSellingPrice, totalPointsRedeemed, finalPayable } = useMemo(() => getCartTotals(lines), [lines]);
  const vendorGroups = useMemo(() => getVendorGroups(lines), [lines]);
  const linesWithCaps = useMemo(
    () =>
      lines.map((line) => ({
        line,
        lineMaxRedeemable: getLineMaxRedeemable(lines, line.product.variantId, customer.walletBalance),
      })),
    [lines, customer.walletBalance],
  );

  const remainingBalance = customer.walletBalance - totalPointsRedeemed;
  const pointsExceedBalance = totalPointsRedeemed > customer.walletBalance;
  const checkoutDisabled = lines.length === 0 || pointsExceedBalance || checkingOut;

  return (
    <SectionCard icon={FiShoppingCart} title="Bill Items" subtitle="Products added from search appear here.">
      {lines.length === 0 ? (
        <EmptyState icon={FiShoppingCart} title="No products added yet" description="Search above to add items to the bill." />
      ) : (
        <div className="space-y-3">
          {vendorGroups.length > 1 && (
            <div className="flex items-center gap-2 p-3 text-xs font-semibold text-purple-700 border border-purple-200 rounded-xl bg-purple-50">
              <FiAlertCircle className="w-4 h-4 shrink-0" />
              This cart spans {vendorGroups.length} vendors — checkout will generate {vendorGroups.length} separate
              invoices.
            </div>
          )}

          {linesWithCaps.map(({ line, lineMaxRedeemable }) => (
            <CartLineItem
              key={line.product.variantId}
              line={line}
              lineMaxRedeemable={lineMaxRedeemable}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
              onRemove={onRemove}
              onPointsChange={onPointsChange}
            />
          ))}

          {/* Order Summary */}
          <div className="pt-4 mt-4 space-y-2 border-t border-gray-100">
            <div className="flex items-center justify-between text-sm">
              <p className="text-gray-500">Total MRP</p>
              <p className="font-medium text-gray-700">₹{totalMrp.toLocaleString()}</p>
            </div>
            <div className="flex items-center justify-between text-sm">
              <p className="text-gray-500">Total Selling Price</p>
              <p className="font-medium text-gray-700">₹{totalSellingPrice.toLocaleString()}</p>
            </div>
            {totalMrp > totalSellingPrice && (
              <div className="flex items-center justify-between text-sm">
                <p className="text-emerald-600">You Save</p>
                <p className="font-medium text-emerald-600">₹{(totalMrp - totalSellingPrice).toLocaleString()}</p>
              </div>
            )}
            {totalPointsRedeemed > 0 && (
              <div className="flex items-center justify-between text-sm">
                <p className="text-amber-600">Total Points Redeemed</p>
                <p className="font-medium text-amber-600">
                  - {totalPointsRedeemed.toLocaleString()} pts (₹{totalPointsRedeemed.toLocaleString()})
                </p>
              </div>
            )}

            <p className="text-[11px] text-gray-400">
              {remainingBalance.toLocaleString()} / {customer.walletBalance.toLocaleString()} pts remaining after this
              bill.
            </p>

            {pointsExceedBalance && (
              <div className="flex items-center gap-2 p-2 text-xs text-red-700 border border-red-200 rounded-lg bg-red-50">
                <FiAlertCircle className="w-3.5 h-3.5 shrink-0" />
                Points redeemed exceed the customer's balance.
              </div>
            )}

            <div className="flex items-center justify-between pt-2 mt-2 border-t border-gray-100">
              <p className="text-sm font-bold text-gray-900">Final Amount Payable</p>
              <p className="text-lg font-black text-gray-900">₹{finalPayable.toLocaleString()}</p>
            </div>
          </div>

          {checkoutError && <ErrorState message={checkoutError} />}

          <button
            type="button"
            onClick={onCheckout}
            disabled={checkoutDisabled}
            className="w-full py-2.5 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {checkingOut ? "Processing..." : "Checkout"}
          </button>
        </div>
      )}
    </SectionCard>
  );
}

export default memo(Cart);
