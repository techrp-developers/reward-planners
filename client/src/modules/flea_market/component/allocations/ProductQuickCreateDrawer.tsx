import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FiPlusCircle, FiX } from "react-icons/fi";
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

interface VariantRowState {
  id: string;
  label: string;
  mrp: string;
  salePrice: string;
  initialStock: string;
}

function makeEmptyRow(): VariantRowState {
  return { id: crypto.randomUUID(), label: "", mrp: "", salePrice: "", initialStock: "" };
}

const inputClass =
  "w-full px-3 py-2 mt-1 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15";

const rowInputClass =
  "w-full px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15";

function ProductQuickCreateDrawer({ open, vendorId, onClose, onCreated }: ProductQuickCreateDrawerProps) {
  const [productName, setProductName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [variantRows, setVariantRows] = useState<VariantRowState[]>([makeEmptyRow()]);
  const [rewardRuleId, setRewardRuleId] = useState("");

  // Set only once a multi-variant submission succeeds — while this is
  // non-null the drawer shows the variant picker instead of the form, and
  // hasn't called onCreated/reset/onClose yet (the single-variant case
  // never sets this at all, so its flow is byte-for-byte what it was before).
  const [multiVariantResult, setMultiVariantResult] = useState<CreatedProduct | null>(null);
  const [pickedVariantId, setPickedVariantId] = useState<number | null>(null);

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

  // Reward mapping is product-level, not per-variant — the first row's price
  // is used as the representative price for filtering which rules are worth
  // offering. In the default single-row case this is exactly the same value
  // that drove this filter before, so nothing changes for that path.
  const firstRowSalePrice = Number(variantRows[0]?.salePrice);
  const hasSalePrice =
    (variantRows[0]?.salePrice.trim() ?? "") !== "" && Number.isFinite(firstRowSalePrice) && firstRowSalePrice >= 0;

  const applicableRules = useMemo(() => {
    if (!hasSalePrice) return [];
    return (rewardRulesQuery.data ?? []).filter((rule) => ruleAppliesToPrice(rule, firstRowSalePrice));
  }, [rewardRulesQuery.data, hasSalePrice, firstRowSalePrice]);

  // Derived, not stored: a rule picked while typing a different Sale Price
  // can stop applying the moment the price changes, so the raw rewardRuleId
  // state is only ever trusted once it's confirmed still in applicableRules
  // — everywhere else (select value, submit payload) uses this instead,
  // rather than submitting a mapping that would be a no-op at checkout.
  const effectiveRewardRuleId = applicableRules.some((rule) => String(rule.rewardRuleId) === rewardRuleId)
    ? rewardRuleId
    : "";

  const isRowValid = (row: VariantRowState) => {
    const mrpNum = Number(row.mrp);
    const saleNum = Number(row.salePrice);
    const stockNum = Number(row.initialStock);
    return (
      row.mrp.trim() !== "" &&
      Number.isFinite(mrpNum) &&
      mrpNum >= 0 &&
      row.salePrice.trim() !== "" &&
      Number.isFinite(saleNum) &&
      saleNum >= 0 &&
      saleNum <= mrpNum &&
      row.initialStock.trim() !== "" &&
      Number.isInteger(stockNum) &&
      stockNum >= 0
    );
  };
  const allRowsValid = variantRows.length > 0 && variantRows.every(isRowValid);

  const handleAddRow = () => setVariantRows((prev) => [...prev, makeEmptyRow()]);
  const handleRemoveRow = (id: string) =>
    setVariantRows((prev) => (prev.length > 1 ? prev.filter((row) => row.id !== id) : prev));
  const handleRowChange = (id: string, field: keyof Omit<VariantRowState, "id">, value: string) =>
    setVariantRows((prev) => prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)));

  const mutation = useMutation({
    mutationFn: () => {
      if (!vendorId) throw new Error("Select a vendor first");
      return createProduct({
        vendorId,
        productName,
        brandName: brandName || undefined,
        rewardRuleId: effectiveRewardRuleId ? Number(effectiveRewardRuleId) : undefined,
        variants: variantRows.map((row) => ({
          label: row.label.trim() || undefined,
          mrp: Number(row.mrp),
          salePrice: Number(row.salePrice),
          initialStock: Number(row.initialStock),
        })),
      });
    },
  });

  const reset = () => {
    setProductName("");
    setBrandName("");
    setVariantRows([makeEmptyRow()]);
    setRewardRuleId("");
    setMultiVariantResult(null);
    setPickedVariantId(null);
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

        // More than one variant: let the manager choose which one this
        // batch's top-up is for, instead of guessing — the others stay in
        // the catalog to allocate separately afterwards.
        if (product.variants.length > 1) {
          setMultiVariantResult(product);
          setPickedVariantId(product.variants[0].variantId);
          return;
        }

        onCreated(product);
        reset();
        onClose();
      },
    });
  };

  const handleConfirmVariantPick = () => {
    if (!multiVariantResult || pickedVariantId == null) return;
    const chosen = multiVariantResult.variants.find((variant) => variant.variantId === pickedVariantId);
    if (!chosen) return;

    onCreated({
      ...multiVariantResult,
      variantId: chosen.variantId,
      sku: chosen.sku,
      mrp: chosen.mrp,
      salePrice: chosen.salePrice,
      stock: chosen.stock,
    });
    reset();
    onClose();
  };

  return (
    <Drawer open={open} title="Add New Product" onClose={handleClose}>
      {!vendorId ? (
        <p className="text-sm text-gray-500">Select a vendor on the allocation form first.</p>
      ) : multiVariantResult ? (
        <div className="space-y-4">
          <div className="p-3 text-sm border rounded-lg border-emerald-200 bg-emerald-50 text-emerald-800">
            <p className="font-semibold">
              "{multiVariantResult.productName}" created with {multiVariantResult.variants.length} variants.
            </p>
            <p className="mt-1 text-xs">
              Pick which one to add to this top-up batch — the others stay in the catalog to allocate separately.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {multiVariantResult.variants.map((variant, index) => {
              const isPicked = pickedVariantId === variant.variantId;
              return (
                <button
                  key={variant.variantId}
                  type="button"
                  onClick={() => setPickedVariantId(variant.variantId)}
                  className={`px-3 py-2 text-left text-xs font-bold rounded-xl border transition-all ${
                    isPicked
                      ? "border-purple-500 bg-purple-50 text-purple-800 ring-2 ring-purple-200"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {variant.label || `Variant ${index + 1}`}
                  <span className="block font-normal text-gray-400">
                    ₹{variant.salePrice.toLocaleString()} · {variant.stock.toLocaleString()} in stock
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleConfirmVariantPick}
            className="w-full py-2.5 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20 transition-all"
          >
            Add Selected Variant to Top-Up
          </button>
        </div>
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

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700">Variants</label>
              <button
                type="button"
                onClick={handleAddRow}
                className="flex items-center gap-1 text-[11px] font-bold text-purple-600 hover:text-purple-800"
              >
                <FiPlusCircle className="w-3 h-3" />
                Add Variant
              </button>
            </div>

            <div className="mt-1 space-y-2">
              {variantRows.map((row, index) => {
                const valid = isRowValid(row);
                const priceInvalid = row.salePrice.trim() !== "" && !valid;
                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-[1.2fr_1fr_1fr_1fr_auto] items-end gap-2 p-2 border rounded-lg border-slate-100 bg-slate-50/60"
                  >
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500">Label (optional)</label>
                      <input
                        value={row.label}
                        onChange={(e) => handleRowChange(row.id, "label", e.target.value)}
                        placeholder="e.g. 1kg"
                        className={rowInputClass}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500">MRP</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.mrp}
                        onChange={(e) => handleRowChange(row.id, "mrp", e.target.value)}
                        className={rowInputClass}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500">Sale Price</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={row.salePrice}
                        onChange={(e) => handleRowChange(row.id, "salePrice", e.target.value)}
                        className={`${rowInputClass} ${priceInvalid ? "border-red-300" : ""}`}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500">Stock</label>
                      <input
                        type="number"
                        min={0}
                        value={row.initialStock}
                        onChange={(e) => handleRowChange(row.id, "initialStock", e.target.value)}
                        className={rowInputClass}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(row.id)}
                      disabled={variantRows.length === 1}
                      aria-label={`Remove variant row ${index + 1}`}
                      className="p-1.5 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-gray-400">SKU is generated automatically for each variant.</p>
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
                No redeemable rule covers ₹{variantRows[0]?.salePrice} — leave unmapped or adjust the price.
              </p>
            ) : (
              <p className="mt-1 text-[11px] text-gray-400">
                Applies to the product overall, based on the first variant's price — picking one maps it instantly.
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
            disabled={mutation.isPending || !allRowsValid || !productName.trim()}
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
