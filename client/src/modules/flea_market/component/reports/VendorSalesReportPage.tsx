import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiBarChart2, FiFilter, FiInfo } from "react-icons/fi";
import { useDebounce } from "../../../../common/hooks/useDebounce";
import { listFleaMarketCompanies } from "../../api/fleaMarketCompaniesApi";
import { searchVendors, type FleaMarketVendor } from "../../api/fleaMarketVendorsApi";
import { searchCatalogProducts, type FleaMarketProduct } from "../../api/fleaMarketProductsApi";
import {
  fetchVendorSalesReport,
  listReportSchedules,
  type ReportScheduleOption,
  type VendorSalesReportFilters,
} from "../../api/fleaMarketReportsApi";
import SectionCard from "../ui/SectionCard";
import { EmptyState, ErrorState } from "../ui/EmptyState";
import Skeleton from "../ui/Skeleton";
import VendorSalesSummaryCards from "./VendorSalesSummaryCards";
import VendorSalesTable from "./VendorSalesTable";

const inputClass =
  "w-full px-3 py-2 mt-1 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15 disabled:bg-gray-50 disabled:text-gray-400";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgo() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString().slice(0, 10);
}

function formatScheduleLabel(schedule: ReportScheduleOption) {
  return `${schedule.scheduledDate} - ${schedule.locationName} (${schedule.status})`;
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((item) => (
          <Skeleton key={item} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}

export default function VendorSalesReportPage() {
  const [companyId, setCompanyId] = useState<number | "">("");
  const [scheduleId, setScheduleId] = useState<number | "">("");
  const [scheduleQuery, setScheduleQuery] = useState("");
  const [fromDate, setFromDate] = useState(thirtyDaysAgo());
  const [toDate, setToDate] = useState(today());
  const [selectedVendor, setSelectedVendor] = useState<FleaMarketVendor | null>(null);
  const [vendorQuery, setVendorQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<FleaMarketProduct | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<VendorSalesReportFilters | null>(null);

  const debouncedVendorQuery = useDebounce(vendorQuery, 350);
  const debouncedProductQuery = useDebounce(productQuery, 350);

  const companiesQuery = useQuery({
    queryKey: ["flea-market", "report-companies"],
    queryFn: listFleaMarketCompanies,
  });

  const selectedCompanyId = companyId === "" ? companiesQuery.data?.[0]?.companyId ?? "" : companyId;

  const schedulesQuery = useQuery({
    queryKey: ["flea-market", "report-schedules", selectedCompanyId],
    queryFn: () => listReportSchedules(Number(selectedCompanyId)),
    enabled: selectedCompanyId !== "",
  });

  const vendorSearchQuery = useQuery({
    queryKey: ["flea-market", "report-vendor-search", debouncedVendorQuery],
    queryFn: () => searchVendors(debouncedVendorQuery.trim()),
    enabled: debouncedVendorQuery.trim().length >= 2 && !selectedVendor,
  });

  const productSearchQuery = useQuery({
    queryKey: ["flea-market", "report-product-search", debouncedProductQuery],
    queryFn: () => searchCatalogProducts(debouncedProductQuery.trim()),
    enabled: debouncedProductQuery.trim().length >= 2 && !selectedProduct,
  });

  const reportQuery = useQuery({
    queryKey: ["flea-market", "vendor-sales-report", appliedFilters],
    queryFn: () => fetchVendorSalesReport(appliedFilters as VendorSalesReportFilters),
    enabled: appliedFilters !== null,
  });

  const filteredSchedules = useMemo(() => {
    const query = scheduleQuery.trim().toLowerCase();
    if (!query) return schedulesQuery.data ?? [];
    return (schedulesQuery.data ?? []).filter((schedule) =>
      formatScheduleLabel(schedule).toLowerCase().includes(query),
    );
  }, [scheduleQuery, schedulesQuery.data]);

  const handleApplyFilters = () => {
    if (selectedCompanyId === "") return;
    setAppliedFilters({
      companyId: Number(selectedCompanyId),
      scheduleId: scheduleId === "" ? null : Number(scheduleId),
      fromDate,
      toDate,
      vendorId: selectedVendor?.vendorId ?? null,
      productId: selectedProduct?.productId ?? null,
    });
  };

  const selectedSchedule = (schedulesQuery.data ?? []).find((schedule) => schedule.scheduleId === scheduleId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-10 h-10 text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78]">
              <FiBarChart2 className="w-5 h-5" />
            </span>
            <div>
              <h1 className="text-xl font-black text-gray-900">Vendor Sales Report</h1>
              <p className="text-sm text-gray-500">Vendor-wise product selling history for flea market events.</p>
            </div>
          </div>
        </div>
      </div>

      <SectionCard icon={FiFilter} title="Filters">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div>
            <label className="text-xs font-semibold text-slate-700">Company</label>
            <select
              value={selectedCompanyId}
              onChange={(event) => {
                setCompanyId(event.target.value ? Number(event.target.value) : "");
                setScheduleId("");
                setScheduleQuery("");
              }}
              className={inputClass}
            >
              <option value="">Select company</option>
              {(companiesQuery.data ?? []).map((company) => (
                <option key={company.companyId} value={company.companyId}>
                  {company.companyName}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <label className="text-xs font-semibold text-slate-700">Event / Schedule</label>
            {selectedSchedule ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 mt-1 text-sm border border-emerald-200 rounded-lg bg-emerald-50">
                <span className="min-w-0 font-semibold text-emerald-800 truncate">
                  {formatScheduleLabel(selectedSchedule)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setScheduleId("");
                    setScheduleQuery("");
                  }}
                  className="text-xs font-bold text-emerald-700 underline shrink-0"
                >
                  All events
                </button>
              </div>
            ) : (
              <>
                <input
                  value={scheduleQuery}
                  onChange={(event) => setScheduleQuery(event.target.value)}
                  placeholder="All events"
                  disabled={selectedCompanyId === ""}
                  className={inputClass}
                />
                {scheduleQuery.trim() && (
                  <div className="absolute z-20 w-full mt-1 overflow-y-auto bg-white border border-gray-100 shadow-lg max-h-60 rounded-lg">
                    {schedulesQuery.isFetching && <p className="p-3 text-xs text-gray-400">Loading schedules...</p>}
                    {!schedulesQuery.isFetching && filteredSchedules.length === 0 && (
                      <p className="p-3 text-xs text-gray-400">No schedules found.</p>
                    )}
                    {filteredSchedules.map((schedule) => (
                      <button
                        key={schedule.scheduleId}
                        type="button"
                        onClick={() => {
                          setScheduleId(schedule.scheduleId);
                          setScheduleQuery("");
                        }}
                        className="block w-full px-3 py-2 text-sm text-left border-b border-gray-50 last:border-b-0 hover:bg-gray-50"
                      >
                        {formatScheduleLabel(schedule)}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              disabled={scheduleId !== ""}
              className={inputClass}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              disabled={scheduleId !== ""}
              className={inputClass}
            />
          </div>

          <div className="relative">
            <label className="text-xs font-semibold text-slate-700">Vendor</label>
            {selectedVendor ? (
              <div className="flex items-center justify-between px-3 py-2 mt-1 text-sm border border-emerald-200 rounded-lg bg-emerald-50">
                <span className="min-w-0 font-semibold text-emerald-800 truncate">
                  {selectedVendor.companyName ?? selectedVendor.fullName}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedVendor(null);
                    setVendorQuery("");
                  }}
                  className="text-xs font-bold text-emerald-700 underline shrink-0"
                >
                  All vendors
                </button>
              </div>
            ) : (
              <>
                <input
                  value={vendorQuery}
                  onChange={(event) => setVendorQuery(event.target.value)}
                  placeholder="All vendors"
                  className={inputClass}
                />
                {vendorQuery.trim().length >= 2 && (
                  <div className="absolute z-20 w-full mt-1 overflow-y-auto bg-white border border-gray-100 shadow-lg max-h-60 rounded-lg">
                    {vendorSearchQuery.isFetching && <p className="p-3 text-xs text-gray-400">Searching vendors...</p>}
                    {!vendorSearchQuery.isFetching && (vendorSearchQuery.data?.length ?? 0) === 0 && (
                      <p className="p-3 text-xs text-gray-400">No vendors found.</p>
                    )}
                    {(vendorSearchQuery.data ?? []).map((vendor) => (
                      <button
                        key={vendor.vendorId}
                        type="button"
                        onClick={() => {
                          setSelectedVendor(vendor);
                          setVendorQuery("");
                        }}
                        className="block w-full px-3 py-2 text-sm text-left border-b border-gray-50 last:border-b-0 hover:bg-gray-50"
                      >
                        {vendor.companyName ?? vendor.fullName}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="relative">
            <label className="text-xs font-semibold text-slate-700">Product</label>
            {selectedProduct ? (
              <div className="flex items-center justify-between px-3 py-2 mt-1 text-sm border border-emerald-200 rounded-lg bg-emerald-50">
                <span className="min-w-0 font-semibold text-emerald-800 truncate">{selectedProduct.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProduct(null);
                    setProductQuery("");
                  }}
                  className="text-xs font-bold text-emerald-700 underline shrink-0"
                >
                  All products
                </button>
              </div>
            ) : (
              <>
                <input
                  value={productQuery}
                  onChange={(event) => setProductQuery(event.target.value)}
                  placeholder="All products"
                  className={inputClass}
                />
                {productQuery.trim().length >= 2 && (
                  <div className="absolute z-20 w-full mt-1 overflow-y-auto bg-white border border-gray-100 shadow-lg max-h-60 rounded-lg">
                    {productSearchQuery.isFetching && <p className="p-3 text-xs text-gray-400">Searching products...</p>}
                    {!productSearchQuery.isFetching && (productSearchQuery.data?.length ?? 0) === 0 && (
                      <p className="p-3 text-xs text-gray-400">No products found.</p>
                    )}
                    {(productSearchQuery.data ?? []).map((product) => (
                      <button
                        key={product.variantId}
                        type="button"
                        onClick={() => {
                          setSelectedProduct(product);
                          setProductQuery("");
                        }}
                        className="block w-full px-3 py-2 text-sm text-left border-b border-gray-50 last:border-b-0 hover:bg-gray-50"
                      >
                        {product.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button
            type="button"
            onClick={handleApplyFilters}
            disabled={selectedCompanyId === "" || reportQuery.isFetching}
            className="px-5 py-2.5 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {reportQuery.isFetching ? "Loading..." : "Apply Filters"}
          </button>
        </div>
      </SectionCard>

      {!appliedFilters && (
        <EmptyState
          icon={FiBarChart2}
          title="Choose filters to build the report"
          description="Select a company, optionally narrow by event, date range, or vendor, then apply filters."
        />
      )}

      {reportQuery.isLoading && <ReportSkeleton />}

      {reportQuery.isError && (
        <ErrorState message="Unable to load the vendor sales report." onRetry={() => void reportQuery.refetch()} />
      )}

      {reportQuery.data && !reportQuery.isLoading && (
        reportQuery.data.vendors.length === 0 ? (
          <EmptyState icon={FiBarChart2} title="No sales recorded" description="No sales recorded for this selection." />
        ) : (
          <>
            <VendorSalesSummaryCards summary={reportQuery.data.summary} />
            {appliedFilters?.productId && (
              <div className="flex items-start gap-2 p-3 text-xs border rounded-xl text-amber-800 bg-amber-50 border-amber-100">
                <FiInfo className="w-4 h-4 mt-0.5 shrink-0" />
                Points Redeemed above reflects the vendor's total across all products in this date range — reward
                points aren't tracked per product, so the product filter doesn't narrow that figure.
              </div>
            )}
            <VendorSalesTable vendors={reportQuery.data.vendors} />
            <p className="text-xs text-gray-400">{reportQuery.data.scheduleJoinReliability}</p>
          </>
        )
      )}
    </div>
  );
}
