import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FiBox, FiCheckCircle, FiPlusCircle, FiX } from "react-icons/fi";
import { useDebounce } from "../../../../common/hooks/useDebounce";
import { searchVendors, type FleaMarketVendor } from "../../api/fleaMarketVendorsApi";
import { listVendorStockPools, topUpVendorStock } from "../../api/fleaMarketVendorStockApi";
import SectionCard from "../ui/SectionCard";
import Spinner from "../ui/Spinner";
import { ErrorState } from "../ui/EmptyState";
import AllocationsTable from "./AllocationsTable";
import VendorQuickCreateDrawer from "./VendorQuickCreateDrawer";
import ProductQuickCreateDrawer from "./ProductQuickCreateDrawer";
import ProductPicker from "./ProductPicker";
import type { FleaMarketProduct } from "../../api/fleaMarketProductsApi";
import { getAllLabelsPrintUrl } from "../../api/fleaMarketLabelsApi";
import PrintLabelButton from "./PrintLabelButton";

const inputClass =
  "w-full px-3 py-2 mt-1 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15 disabled:bg-gray-50";

type StockFlowStep = "select-vendor" | "select-products";

// One row per product checked in ProductPicker — quantity entered here, not
// a separate step, so a manager can check several products from the same
// vendor and set all their quantities before submitting once.
interface SelectedTopUpRow {
  product: FleaMarketProduct;
  qty: string;
}

// Standalone master-data screen — NOT tied to any schedule_id. Stock is
// added once to a persistent vendor+product pool here; whichever event is
// currently live automatically sees everything in that pool that's still in
// stock (see poolStockModel.findActivePools / productController.search).
// There is no per-event "allocate to this event" step anymore.
function StockPage() {
  const queryClient = useQueryClient();

  const [selectedVendor, setSelectedVendor] = useState<FleaMarketVendor | null>(null);
  const [vendorQuery, setVendorQuery] = useState("");
  const debouncedVendorQuery = useDebounce(vendorQuery, 350);

  // Strict linear flow: products can only ever be picked from the already
  // vendor-filtered list (ProductPicker), never searched independently.
  const [selectedRows, setSelectedRows] = useState<SelectedTopUpRow[]>([]);
  const selectedVariantIds = new Set(selectedRows.map((row) => row.product.variantId));

  const [vendorDrawerOpen, setVendorDrawerOpen] = useState(false);
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);

  // Unscoped — every vendor stock pool, regardless of which event (if any)
  // it was last touched during. This is the master stock view: it never
  // hides zero-stock pools, since a manager needs to see what ran out to
  // decide whether to top it back up (only the billing-facing search/scan
  // hides zero-stock items).
  const poolsQuery = useQuery({
    queryKey: ["flea-market", "vendor-stock"],
    queryFn: () => listVendorStockPools(),
    // "Currently in Pool" figures drive live top-up decisions — a stale
    // cached read here (global default is 10s) could show room that's
    // already sold. Every mutation that touches a pool also invalidates
    // this key, so staleTime:0 is cheap: it only matters on a fresh mount.
    staleTime: 0,
  });

  const vendorSearchQuery = useQuery({
    queryKey: ["flea-market", "vendor-search", debouncedVendorQuery],
    queryFn: () => searchVendors(debouncedVendorQuery.trim()),
    enabled: debouncedVendorQuery.trim().length >= 2 && !selectedVendor,
  });

  const step: StockFlowStep = !selectedVendor ? "select-vendor" : "select-products";

  // Stock changes here are visible on three separate surfaces: this page's
  // own pool table, billing's product search, and the All Products overview
  // — all three must go stale together, or one of them shows pre-top-up
  // numbers until its own staleTime happens to lapse.
  const invalidatePools = () => {
    void queryClient.invalidateQueries({ queryKey: ["flea-market", "vendor-stock"] });
    void queryClient.invalidateQueries({ queryKey: ["flea-market", "products", "search"] });
    void queryClient.invalidateQueries({ queryKey: ["flea-market", "all-products"] });
  };

  const handleToggleProduct = (product: FleaMarketProduct) => {
    setSelectedRows((prev) => {
      const exists = prev.some((row) => row.product.variantId === product.variantId);
      if (exists) return prev.filter((row) => row.product.variantId !== product.variantId);
      return [...prev, { product, qty: "" }];
    });
  };

  const handleQtyChange = (variantId: number, qty: string) => {
    setSelectedRows((prev) => prev.map((row) => (row.product.variantId === variantId ? { ...row, qty } : row)));
  };

  const handleRemoveSelectedRow = (variantId: number) => {
    setSelectedRows((prev) => prev.filter((row) => row.product.variantId !== variantId));
  };

  const isRowValid = (row: SelectedTopUpRow) => {
    const n = Number(row.qty);
    return row.qty.trim() !== "" && Number.isInteger(n) && n >= 1 && n <= row.product.stock;
  };
  const allRowsValid = selectedRows.length > 0 && selectedRows.every(isRowValid);

  // Existing pool for a given variant under the selected vendor, if any —
  // shown as "Currently in pool: N available" so it's clear a top-up ADDS to
  // this rather than replacing it.
  const findExistingPool = (variantId: number) =>
    poolsQuery.data?.find((pool) => pool.vendorId === selectedVendor?.vendorId && pool.variantId === variantId);

  // Batch: the backend only tops up one product per call, so this fires one
  // topUpVendorStock per selected row and lets each succeed/fail on its own
  // — a bad row (e.g. stock changed underneath) shouldn't block the rest.
  // No scheduleId is ever passed here — this is always a warehouse-level
  // top-up (logged with schedule_id=NULL), never tied to a specific event.
  const allocateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedVendor) throw new Error("Select a vendor first");

      const outcomes = await Promise.allSettled(
        selectedRows.map((row) =>
          topUpVendorStock({
            vendorId: selectedVendor.vendorId,
            productId: row.product.productId,
            variantId: row.product.variantId,
            allocatedQty: Number(row.qty),
          }),
        ),
      );

      return outcomes.map((outcome, index) => ({ row: selectedRows[index], outcome }));
    },
    onSuccess: (results) => {
      const failed = results.filter((r) => r.outcome.status === "rejected");
      const succeededCount = results.length - failed.length;

      if (succeededCount > 0) {
        toast.success(`${succeededCount} product${succeededCount > 1 ? "s" : ""} topped up`);
      }
      if (failed.length > 0) {
        toast.error(
          `${failed.length} of ${results.length} top-up${results.length > 1 ? "s" : ""} failed — check the highlighted rows and retry`,
        );
      }

      // Vendor stays selected — succeeded rows clear so the product list
      // reappears ready for the next batch; failed rows stay so they can be retried.
      setSelectedRows(failed.map((f) => f.row));
      invalidatePools();
    },
    onError: (error) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to top up stock.";
      toast.error(message);
    },
  });

  const handleAllocate = (e: FormEvent) => {
    e.preventDefault();
    allocateMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white border border-gray-100 shadow-md rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-xl">
            <FiBox className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Add Stock</h1>
            <p className="text-sm text-gray-500">
              Top up a vendor's persistent stock pool — every active event automatically sells from it, no per-event
              allocation step.
            </p>
          </div>
        </div>
        <PrintLabelButton label="Print All Labels" variant="primary" getUrl={(format) => getAllLabelsPrintUrl(format)} />
      </div>

      {/* Top-up form — strict linear flow: vendor first, then only that
          vendor's products, checked in as a batch with a quantity each. */}
      <SectionCard icon={FiBox} title="Top Up Vendor Stock" subtitle="Add to a vendor's persistent flea market stock pool.">
        <form onSubmit={handleAllocate} className="space-y-4">
          {/* Step 1: Vendor */}
          <div>
            <label className="flex items-center justify-between text-xs font-semibold text-slate-700">
              Vendor
              <button
                type="button"
                onClick={() => setVendorDrawerOpen(true)}
                className="flex items-center gap-1 text-[11px] font-bold text-purple-600 hover:text-purple-800"
              >
                <FiPlusCircle className="w-3 h-3" />
                Add New Vendor
              </button>
            </label>
            {selectedVendor ? (
              <div className="flex items-center justify-between px-3 py-2 mt-1 text-sm border rounded-lg border-emerald-200 bg-emerald-50">
                <span className="flex items-center gap-1.5 font-semibold text-emerald-800">
                  <FiCheckCircle className="w-3.5 h-3.5" />
                  {selectedVendor.companyName}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedVendor(null);
                    setSelectedRows([]);
                  }}
                  className="text-xs font-bold underline text-emerald-700"
                >
                  Change Vendor
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  value={vendorQuery}
                  onChange={(e) => setVendorQuery(e.target.value)}
                  placeholder="Search vendors..."
                  className={inputClass}
                />
                {vendorQuery.trim().length >= 2 && (
                  <div className="absolute z-10 w-full mt-1 overflow-y-auto bg-white border border-gray-100 rounded-lg shadow-lg max-h-56">
                    {vendorSearchQuery.isFetching && (
                      <div className="py-3">
                        <Spinner label="Searching..." />
                      </div>
                    )}
                    {!vendorSearchQuery.isFetching && (vendorSearchQuery.data?.length ?? 0) === 0 && (
                      <p className="p-3 text-xs text-center text-gray-400">No vendors found.</p>
                    )}
                    {!vendorSearchQuery.isFetching &&
                      vendorSearchQuery.data?.map((vendor) => (
                        <button
                          key={vendor.vendorId}
                          type="button"
                          onClick={() => {
                            setSelectedVendor(vendor);
                            setVendorQuery("");
                          }}
                          className="block w-full px-3 py-2 text-sm text-left border-b border-gray-50 last:border-b-0 hover:bg-gray-50"
                        >
                          {vendor.companyName}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: check any number of products from the vendor's list —
              checkboxes are native inputs, so Tab + Space works with no
              custom keyboard handling. */}
          {step === "select-products" && selectedVendor && (
            <ProductPicker
              vendorId={selectedVendor.vendorId}
              selectedVariantIds={selectedVariantIds}
              onToggle={handleToggleProduct}
              onAddNew={() => setProductDrawerOpen(true)}
            />
          )}

          {/* Selected-for-top-up table — one row per checked product,
              quantity entered inline, submitted as a single batch. */}
          {selectedRows.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Selected for Top-Up ({selectedRows.length})
              </label>
              <div className="mt-1 overflow-x-auto border border-gray-100 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-[11px] font-bold tracking-wider text-left text-gray-500 uppercase">
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-right">Currently in Pool</th>
                      <th className="px-3 py-2 text-right">Qty to Add</th>
                      <th className="w-10 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedRows.map((row) => {
                      const valid = isRowValid(row);
                      const existingPool = findExistingPool(row.product.variantId);
                      return (
                        <tr key={row.product.variantId}>
                          <td className="px-3 py-2 font-semibold text-gray-800">
                            {row.product.name}
                            <span className="ml-1 font-normal text-gray-400">· {row.product.sku}</span>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500">
                            {existingPool ? `${existingPool.availableQty.toLocaleString()} available` : "New pool"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <input
                              type="number"
                              min={1}
                              max={row.product.stock}
                              value={row.qty}
                              onChange={(e) => handleQtyChange(row.product.variantId, e.target.value)}
                              placeholder="Qty"
                              className={`w-24 px-2 py-1 text-sm text-right bg-white border rounded-lg outline-none focus:ring-4 focus:ring-[#852BAF]/15 ${
                                row.qty.trim() !== "" && !valid ? "border-red-300" : "border-slate-200"
                              }`}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveSelectedRow(row.product.variantId)}
                              aria-label={`Remove ${row.product.name} from selection`}
                              className="text-gray-400 hover:text-red-600"
                            >
                              <FiX className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <button
                type="submit"
                disabled={!allRowsValid || allocateMutation.isPending}
                className="w-full py-2.5 mt-3 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {allocateMutation.isPending
                  ? "Topping up..."
                  : `Top Up ${selectedRows.length} Product${selectedRows.length > 1 ? "s" : ""}`}
              </button>
            </div>
          )}
        </form>
      </SectionCard>

      {/* Master stock view — every pool, every vendor, across all events.
          Zero-stock pools stay listed here (unlike billing search/scan) so a
          manager can see what ran out and top it back up. */}
      <SectionCard
        icon={FiBox}
        title="Vendor Stock Pools"
        subtitle="Every vendor's persistent flea market stock, across all events. Sales, damage, and returns reduce it automatically; whatever's left carries forward to the next event with no re-allocation."
      >
        {poolsQuery.isLoading ? (
          <Spinner label="Loading vendor stock pools..." />
        ) : poolsQuery.isError ? (
          <ErrorState message="Unable to load vendor stock pools." onRetry={() => void poolsQuery.refetch()} />
        ) : (
          <AllocationsTable pools={poolsQuery.data ?? []} />
        )}
      </SectionCard>

      <VendorQuickCreateDrawer
        open={vendorDrawerOpen}
        onClose={() => setVendorDrawerOpen(false)}
        onCreated={(vendor) => {
          setSelectedVendor(vendor);
          setSelectedRows([]);
        }}
      />
      <ProductQuickCreateDrawer
        open={productDrawerOpen}
        vendorId={selectedVendor?.vendorId ?? null}
        onClose={() => setProductDrawerOpen(false)}
        onCreated={(product) => {
          setSelectedRows((prev) => [
            ...prev,
            {
              product: {
                variantId: product.variantId,
                productId: product.productId,
                vendorId: selectedVendor?.vendorId ?? 0,
                name: product.productName,
                brand: product.brandName,
                sku: product.sku ?? "",
                mrp: product.mrp,
                salePrice: product.salePrice,
                stock: product.stock,
              },
              qty: "",
            },
          ]);
        }}
      />
    </div>
  );
}

export default StockPage;
