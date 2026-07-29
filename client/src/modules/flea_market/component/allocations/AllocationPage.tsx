import { useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FiAlertTriangle, FiBox, FiCheckCircle, FiLock, FiMapPin, FiPlayCircle, FiPlusCircle } from "react-icons/fi";
import { useDebounce } from "../../../../common/hooks/useDebounce";
import { getSchedule, updateScheduleStatus } from "../../api/fleaMarketScheduleApi";
import { searchVendors, type FleaMarketVendor } from "../../api/fleaMarketVendorsApi";
import {
  listAllocations,
  createAllocation,
  fetchReconciliationPreview,
  closeSchedule,
} from "../../api/fleaMarketAllocationsApi";
import SectionCard from "../ui/SectionCard";
import Spinner from "../ui/Spinner";
import { EmptyState, ErrorState } from "../ui/EmptyState";
import AllocationsTable from "./AllocationsTable";
import VendorQuickCreateDrawer from "./VendorQuickCreateDrawer";
import ProductQuickCreateDrawer from "./ProductQuickCreateDrawer";
import { searchCatalogProducts, type FleaMarketProduct } from "../../api/fleaMarketProductsApi";
import { getScheduleLabelsPrintUrl } from "../../api/fleaMarketLabelsApi";
import PrintLabelButton from "./PrintLabelButton";

const inputClass =
  "w-full px-3 py-2 mt-1 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15 disabled:bg-gray-50";

function AllocationPage() {
  const [searchParams] = useSearchParams();
  const scheduleId = Number(searchParams.get("schedule_id"));
  const queryClient = useQueryClient();

  const [selectedVendor, setSelectedVendor] = useState<FleaMarketVendor | null>(null);
  const [vendorQuery, setVendorQuery] = useState("");
  const debouncedVendorQuery = useDebounce(vendorQuery, 350);

  const [selectedProduct, setSelectedProduct] = useState<FleaMarketProduct | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const debouncedProductQuery = useDebounce(productQuery, 350);

  const [allocatedQty, setAllocatedQty] = useState("");
  const [allocationPrice, setAllocationPrice] = useState("");

  const [vendorDrawerOpen, setVendorDrawerOpen] = useState(false);
  const [productDrawerOpen, setProductDrawerOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  const scheduleQuery = useQuery({
    queryKey: ["flea-market", "schedule", scheduleId],
    queryFn: () => getSchedule(scheduleId),
    enabled: Number.isInteger(scheduleId) && scheduleId > 0,
  });

  const allocationsQuery = useQuery({
    queryKey: ["flea-market", "allocations", scheduleId],
    queryFn: () => listAllocations(scheduleId),
    enabled: Number.isInteger(scheduleId) && scheduleId > 0,
  });

  const vendorSearchQuery = useQuery({
    queryKey: ["flea-market", "vendor-search", debouncedVendorQuery],
    queryFn: () => searchVendors(debouncedVendorQuery.trim()),
    enabled: debouncedVendorQuery.trim().length >= 2 && !selectedVendor,
  });

  const productSearchQuery = useQuery({
    queryKey: ["flea-market", "catalog-search", debouncedProductQuery, selectedVendor?.vendorId],
    queryFn: () => searchCatalogProducts(debouncedProductQuery.trim(), selectedVendor?.vendorId),
    enabled: debouncedProductQuery.trim().length >= 2 && !selectedProduct,
  });

  const invalidateAllocations = () => {
    void queryClient.invalidateQueries({ queryKey: ["flea-market", "allocations", scheduleId] });
  };

  const allocateMutation = useMutation({
    mutationFn: () => {
      if (!selectedVendor || !selectedProduct) throw new Error("Select a vendor and product first");
      return createAllocation({
        scheduleId,
        vendorId: selectedVendor.vendorId,
        productId: selectedProduct.productId,
        variantId: selectedProduct.variantId,
        allocatedQty: Number(allocatedQty),
        allocationPrice: allocationPrice ? Number(allocationPrice) : undefined,
      });
    },
    onSuccess: () => {
      toast.success("Stock allocated");
      setSelectedProduct(null);
      setProductQuery("");
      setAllocatedQty("");
      setAllocationPrice("");
      invalidateAllocations();
    },
    onError: (error) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to allocate stock.";
      toast.error(message);
    },
  });

  const reconciliationQuery = useQuery({
    queryKey: ["flea-market", "reconciliation", scheduleId],
    queryFn: () => fetchReconciliationPreview(scheduleId),
    enabled: closeConfirmOpen,
  });

  const closeMutation = useMutation({
    mutationFn: () => closeSchedule(scheduleId),
    onSuccess: () => {
      toast.success("Event closed — unsold stock returned to master inventory");
      setCloseConfirmOpen(false);
      invalidateAllocations();
      void queryClient.invalidateQueries({ queryKey: ["flea-market", "schedule", scheduleId] });
    },
    onError: (error) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to close event.";
      toast.error(message);
    },
  });

  const handleAllocate = (e: FormEvent) => {
    e.preventDefault();
    allocateMutation.mutate();
  };

  const startEventMutation = useMutation({
    mutationFn: () => updateScheduleStatus(scheduleId, "in_progress"),
    onSuccess: () => {
      toast.success("Event marked in progress — allocated stock is now sellable at billing");
      void queryClient.invalidateQueries({ queryKey: ["flea-market", "schedule", scheduleId] });
      invalidateAllocations();
    },
    onError: (error) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to start event.";
      toast.error(message);
    },
  });

  if (!Number.isInteger(scheduleId) || scheduleId <= 0) {
    return (
      <EmptyState
        icon={FiBox}
        title="No event selected"
        description="Open this page from an event's 'Allocate Stock' link on the Manage Event page."
      />
    );
  }

  const schedule = scheduleQuery.data;
  const canClose = schedule?.status === "in_progress";

  return (
    <div className="space-y-6">
      {/* Header context */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white border border-gray-100 shadow-md rounded-2xl">
        {scheduleQuery.isLoading ? (
          <Spinner label="Loading event..." />
        ) : schedule ? (
          <div>
            <p className="text-sm font-bold text-gray-900">{schedule.companyName}</p>
            <p className="flex items-center gap-1 mt-1 text-xs text-gray-500">
              <FiMapPin className="w-3 h-3" />
              {schedule.locationName} · {schedule.scheduledDate}
            </p>
          </div>
        ) : (
          <ErrorState message="Unable to load this event." />
        )}

        <div className="flex items-center gap-2">
          {schedule?.status === "scheduled" && (
            <button
              type="button"
              onClick={() => startEventMutation.mutate()}
              disabled={startEventMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-50 disabled:opacity-60"
            >
              <FiPlayCircle className="w-4 h-4" />
              {startEventMutation.isPending ? "Starting..." : "Start Event"}
            </button>
          )}
          <PrintLabelButton
            label="Print All Labels"
            variant="primary"
            getUrl={(format) => getScheduleLabelsPrintUrl(scheduleId, format)}
          />
          <button
            type="button"
            disabled={!canClose}
            onClick={() => setCloseConfirmOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            title={canClose ? "Close this event" : "Event must be in progress to close"}
          >
            <FiLock className="w-4 h-4" />
            Close Event
          </button>
        </div>
      </div>

      {schedule?.status === "scheduled" && (allocationsQuery.data?.length ?? 0) > 0 && (
        <div className="flex items-start gap-3 p-4 border rounded-2xl text-amber-800 bg-amber-50 border-amber-200">
          <FiAlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold">Stock is allocated but not yet sellable</p>
            <p className="mt-0.5 text-xs">
              This event hasn't started — allocated stock won't show up in Billing's product search until you start
              it. Customer verification will still work either way.
            </p>
          </div>
          <button
            type="button"
            onClick={() => startEventMutation.mutate()}
            disabled={startEventMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white rounded-lg bg-amber-600 hover:bg-amber-700 shrink-0 disabled:opacity-60"
          >
            <FiPlayCircle className="w-3.5 h-3.5" />
            {startEventMutation.isPending ? "Starting..." : "Start Event Now"}
          </button>
        </div>
      )}

      {/* Allocation form */}
      <SectionCard icon={FiBox} title="Allocate Stock" subtitle="Assign vendor stock to this event.">
        <form onSubmit={handleAllocate} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Vendor combobox */}
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
                      setSelectedProduct(null);
                    }}
                    className="text-xs font-bold underline text-emerald-700"
                  >
                    Change
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

            {/* Product combobox */}
            <div>
              <label className="flex items-center justify-between text-xs font-semibold text-slate-700">
                Product
                <button
                  type="button"
                  onClick={() => setProductDrawerOpen(true)}
                  disabled={!selectedVendor}
                  className="flex items-center gap-1 text-[11px] font-bold text-purple-600 hover:text-purple-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FiPlusCircle className="w-3 h-3" />
                  Add New Product
                </button>
              </label>
              {selectedProduct ? (
                <div className="flex items-center justify-between px-3 py-2 mt-1 text-sm border rounded-lg border-emerald-200 bg-emerald-50">
                  <span className="flex items-center gap-1.5 font-semibold text-emerald-800">
                    <FiCheckCircle className="w-3.5 h-3.5" />
                    {selectedProduct.name} ({selectedProduct.stock} in master stock)
                  </span>
                  <button type="button" onClick={() => setSelectedProduct(null)} className="text-xs font-bold underline text-emerald-700">
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    disabled={!selectedVendor}
                    placeholder={selectedVendor ? "Search this vendor's products..." : "Select a vendor first"}
                    className={inputClass}
                  />
                  {productQuery.trim().length >= 2 && (
                    <div className="absolute z-10 w-full mt-1 overflow-y-auto bg-white border border-gray-100 rounded-lg shadow-lg max-h-56">
                      {productSearchQuery.isFetching && (
                        <div className="py-3">
                          <Spinner label="Searching..." />
                        </div>
                      )}
                      {!productSearchQuery.isFetching && (productSearchQuery.data?.length ?? 0) === 0 && (
                        <p className="p-3 text-xs text-center text-gray-400">No products found.</p>
                      )}
                      {!productSearchQuery.isFetching &&
                        productSearchQuery.data?.map((product) => (
                          <button
                            key={product.variantId}
                            type="button"
                            onClick={() => {
                              setSelectedProduct(product);
                              setProductQuery("");
                            }}
                            className="flex items-center justify-between w-full px-3 py-2 text-sm text-left border-b border-gray-50 last:border-b-0 hover:bg-gray-50"
                          >
                            <span>{product.name}</span>
                            <span className="text-xs text-gray-400">{product.stock} available</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Allocated Quantity
                {selectedProduct && <span className="text-gray-400"> · {selectedProduct.stock} available in master stock</span>}
              </label>
              <input
                type="number"
                min={1}
                max={selectedProduct?.stock}
                value={allocatedQty}
                onChange={(e) => setAllocatedQty(e.target.value)}
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700">
                Allocation Price <span className="text-gray-400">(optional override)</span>
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={allocationPrice}
                onChange={(e) => setAllocationPrice(e.target.value)}
                placeholder="Defaults to catalog sale price"
                className={inputClass}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!selectedVendor || !selectedProduct || allocateMutation.isPending}
            className="w-full py-2.5 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {allocateMutation.isPending ? "Allocating..." : "Allocate"}
          </button>
        </form>
      </SectionCard>

      {/* Allocations table */}
      <SectionCard icon={FiBox} title="Allocations for this Event">
        {allocationsQuery.isLoading ? (
          <Spinner label="Loading allocations..." />
        ) : allocationsQuery.isError ? (
          <ErrorState message="Unable to load allocations." onRetry={() => void allocationsQuery.refetch()} />
        ) : (
          <AllocationsTable allocations={allocationsQuery.data ?? []} scheduleId={scheduleId} />
        )}
      </SectionCard>

      <VendorQuickCreateDrawer
        open={vendorDrawerOpen}
        onClose={() => setVendorDrawerOpen(false)}
        onCreated={(vendor) => {
          setSelectedVendor(vendor);
          setSelectedProduct(null);
        }}
      />
      <ProductQuickCreateDrawer
        open={productDrawerOpen}
        vendorId={selectedVendor?.vendorId ?? null}
        onClose={() => setProductDrawerOpen(false)}
        onCreated={(product) => {
          setSelectedProduct({
            variantId: product.variantId,
            productId: product.productId,
            vendorId: selectedVendor?.vendorId ?? 0,
            name: product.productName,
            brand: null,
            sku: "",
            mrp: product.mrp,
            salePrice: product.salePrice,
            stock: 0,
          });
        }}
      />

      {/* Close-event confirmation with reconciliation preview */}
      {closeConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCloseConfirmOpen(false)} />
          <div className="relative w-full max-w-2xl p-6 bg-white shadow-2xl rounded-2xl max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900">Close Event — Confirm Reconciliation</h3>
            <p className="mt-1 text-sm text-gray-500">
              This is irreversible: unsold, undamaged stock will return to master inventory and every allocation will be
              closed.
            </p>

            {reconciliationQuery.isLoading ? (
              <div className="py-6">
                <Spinner label="Building preview..." />
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto border border-gray-100 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr className="text-[11px] font-bold tracking-wider text-left text-gray-500 uppercase">
                      <th className="px-3 py-2">Vendor</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-center">Allocated</th>
                      <th className="px-3 py-2 text-center">Sold</th>
                      <th className="px-3 py-2 text-center">Damaged</th>
                      <th className="px-3 py-2 text-center">Will Return</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(reconciliationQuery.data ?? []).map((row) => (
                      <tr key={row.allocationId}>
                        <td className="px-3 py-2">{row.vendorName}</td>
                        <td className="px-3 py-2">{row.productName}</td>
                        <td className="px-3 py-2 text-center">{row.allocatedQty}</td>
                        <td className="px-3 py-2 text-center">{row.soldQty}</td>
                        <td className="px-3 py-2 text-center text-red-600">{row.damagedQty}</td>
                        <td className="px-3 py-2 font-bold text-center">{row.wouldReturnQty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setCloseConfirmOpen(false)}
                disabled={closeMutation.isPending}
                className="flex-1 py-2.5 text-sm font-bold text-gray-700 transition-colors border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => closeMutation.mutate()}
                disabled={closeMutation.isPending}
                className="flex-1 py-2.5 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20 transition-all disabled:opacity-60"
              >
                {closeMutation.isPending ? "Closing..." : "Confirm & Close Event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AllocationPage;
