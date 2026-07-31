import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import Drawer from "../ui/Drawer";
import { ErrorState } from "../ui/EmptyState";
import { createProduct, type CreatedProduct } from "../../api/fleaMarketProductsApi";
import { listRewardRules } from "../../api/fleaMarketRewardRulesApi";

function formatRuleValue(rewardType: string, rewardValue: number): string {
  return rewardType === "percentage" ? `${rewardValue}%` : `₹${rewardValue}`;
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
  // to call the vendor_manager-only /reward/get-rule route with.
  const rewardRulesQuery = useQuery({
    queryKey: ["flea-market", "reward-rules"],
    queryFn: () => listRewardRules(),
    enabled: open,
  });

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
        rewardRuleId: rewardRuleId ? Number(rewardRuleId) : undefined,
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
        if (rewardRuleId && product.rewardMappingFailed) {
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
              value={rewardRuleId}
              onChange={(e) => setRewardRuleId(e.target.value)}
              disabled={rewardRulesQuery.isLoading}
              className={inputClass}
            >
              <option value="">No rule — map it later</option>
              {rewardRulesQuery.data?.map((rule) => (
                <option key={rule.rewardRuleId} value={rule.rewardRuleId}>
                  {rule.name} ({formatRuleValue(rule.rewardType, rule.rewardValue)})
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-gray-400">
              Instantly maps this product to the selected rule so it's redeemable right away.
            </p>
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
