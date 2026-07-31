import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import Drawer from "../ui/Drawer";
import { ErrorState } from "../ui/EmptyState";
import { createProduct, type CreatedProduct } from "../../api/fleaMarketProductsApi";
import { listRewardRules, type FleaMarketRewardRule } from "../../api/fleaMarketRewardRulesApi";

function formatRuleValue(rewardType: string, rewardValue: number): string {
  return rewardType === "percentage" ? `${rewardValue}%` : `₹${rewardValue}`;
}

function formatOrderRange(rule: FleaMarketRewardRule): string {
  return rule.maxOrderAmount != null
    ? `₹${rule.minOrderAmount}–${rule.maxOrderAmount}`
    : `₹${rule.minOrderAmount}+`;
}

// resolveRedemption (server/app/ecommerce/v1/utils/rewardCalculate.js) only
// ever applies a rule when the item's price falls inside its
// min/max_order_amount band — a rule mapped outside that band is a no-op at
// checkout, which is exactly what made "the selected rule" appear unused.
// Filtering here to only what would actually apply keeps every choice real.
function ruleAppliesToPrice(rule: FleaMarketRewardRule, price: number): boolean {
  if (price < rule.minOrderAmount) return false;
  if (rule.maxOrderAmount != null && price > rule.maxOrderAmount) return false;
  return true;
}

interface ProductQuickCreateDrawerProps {
  open: boolean;
  vendorId: number | null;
  onClose: () => void;
  onCreated: (product: CreatedProduct) => void;
}

const inputClass =
  "w-full px-3 py-2 mt-1 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15";

function ProductQuickCreateDrawer({ open, vendorId, onClose, onCreated }: ProductQuickCreateDrawerProps) {
  const [productName, setProductName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [mrp, setMrp] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [initialStock, setInitialStock] = useState("");
  const [rewardRuleId, setRewardRuleId] = useState("");

  // Same rules the vendor-manager's Reward Mapping screen offers, fetched
  // through a flea-market-scoped endpoint since this module has no real JWT
  // to call the vendor_manager-only /reward/get-rule route with. Already
  // filtered server-side to redemption-capable rules only (see
  // rewardRuleModel.findAllRedeemable) — the price-band filter below narrows
  // it further to what would actually apply to THIS product.
  const rewardRulesQuery = useQuery({
    queryKey: ["flea-market", "reward-rules"],
    queryFn: () => listRewardRules(),
    enabled: open,
  });

  const parsedSalePrice = Number(salePrice);
  const hasSalePrice = salePrice.trim() !== "" && Number.isFinite(parsedSalePrice) && parsedSalePrice >= 0;

  const applicableRules = useMemo(() => {
    if (!hasSalePrice) return [];
    return (rewardRulesQuery.data ?? []).filter((rule) => ruleAppliesToPrice(rule, parsedSalePrice));
  }, [rewardRulesQuery.data, hasSalePrice, parsedSalePrice]);

  // Derived, not stored: a rule picked while typing a different Sale Price
  // can stop applying the moment the price changes, so the raw rewardRuleId
  // state is only ever trusted once it's confirmed still in applicableRules
  // — everywhere else (select value, submit payload) uses this instead,
  // rather than submitting a mapping that would be a no-op at checkout.
  const effectiveRewardRuleId = applicableRules.some((rule) => String(rule.rewardRuleId) === rewardRuleId)
    ? rewardRuleId
    : "";

  const mutation = useMutation({
    mutationFn: () => {
      if (!vendorId) throw new Error("Select a vendor first");
      return createProduct({
        vendorId,
        productName,
        brandName: brandName || undefined,
        mrp: Number(mrp),
        salePrice: Number(salePrice),
        initialStock: Number(initialStock),
        rewardRuleId: effectiveRewardRuleId ? Number(effectiveRewardRuleId) : undefined,
      });
    },
  });

  const reset = () => {
    setProductName("");
    setBrandName("");
    setMrp("");
    setSalePrice("");
    setInitialStock("");
    setRewardRuleId("");
    mutation.reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate(undefined, {
      onSuccess: (product) => {
        toast.success(`Product "${product.productName}" created`);
        if (effectiveRewardRuleId && product.rewardMappingFailed) {
          toast.warning("Product created, but the reward rule mapping failed — set it from Reward Mapping instead.");
        }
        onCreated(product);
        reset();
        onClose();
      },
    });
  };

  return (
    <Drawer open={open} title="Add New Product" onClose={handleClose}>
      {!vendorId ? (
        <p className="text-sm text-gray-500">Select a vendor on the allocation form first.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-700">Product Name</label>
            <input value={productName} onChange={(e) => setProductName(e.target.value)} required className={inputClass} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">
              Brand <span className="text-gray-400">(optional)</span>
            </label>
            <input value={brandName} onChange={(e) => setBrandName(e.target.value)} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700">MRP</label>
              <input type="number" min={0} step="0.01" value={mrp} onChange={(e) => setMrp(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">Sale Price</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                required
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">Initial Stock</label>
            <input
              type="number"
              min={0}
              value={initialStock}
              onChange={(e) => setInitialStock(e.target.value)}
              required
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-gray-400">SKU is generated automatically.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">
              Redeem Reward Rule <span className="text-gray-400">(optional)</span>
            </label>
            <select
              value={effectiveRewardRuleId}
              onChange={(e) => setRewardRuleId(e.target.value)}
              disabled={rewardRulesQuery.isLoading || !hasSalePrice}
              className={inputClass}
            >
              <option value="">No rule — map it later</option>
              {applicableRules.map((rule) => (
                <option key={rule.rewardRuleId} value={rule.rewardRuleId}>
                  {rule.name} ({formatRuleValue(rule.rewardType, rule.rewardValue)}, {formatOrderRange(rule)})
                </option>
              ))}
            </select>
            {!hasSalePrice ? (
              <p className="mt-1 text-[11px] text-gray-400">Enter a Sale Price to see which rules apply.</p>
            ) : applicableRules.length === 0 ? (
              <p className="mt-1 text-[11px] text-amber-600">
                No redeemable rule covers ₹{salePrice} — leave unmapped or adjust the price.
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-gray-400">
                Only rules that actually apply to a ₹{salePrice} item are shown — picking one maps it instantly.
              </p>
            )}
          </div>

          {mutation.isError && (
            <ErrorState
              message={
                (mutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                "Failed to create product."
              }
            />
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full py-2.5 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20 transition-all disabled:opacity-60"
          >
            {mutation.isPending ? "Creating..." : "Create Product"}
          </button>
        </form>
      )}
    </Drawer>
  );
}

export default ProductQuickCreateDrawer;
