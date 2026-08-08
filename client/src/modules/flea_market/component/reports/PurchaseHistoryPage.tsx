import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FiChevronLeft, FiChevronRight, FiClock, FiFilter } from "react-icons/fi";
import { useDebounce } from "../../../../common/hooks/useDebounce";
import { searchFleaMarketCustomers, type FleaMarketCustomerSearchResult } from "../../api/fleaMarketUsersApi";
import {
  fetchPurchaseHistory,
  fetchPurchaseHistoryFilterOptions,
  type PurchaseHistoryFilters,
} from "../../api/fleaMarketReportsApi";
import SectionCard from "../ui/SectionCard";
import { EmptyState, ErrorState } from "../ui/EmptyState";
import Skeleton from "../ui/Skeleton";

const inputClass =
  "w-full px-3 py-2 mt-1 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15 disabled:bg-gray-50 disabled:text-gray-400";

const currency = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function today() {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgo() {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString().slice(0, 10);
}

function PurchaseHistorySkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((item) => (
        <Skeleton key={item} className="h-14 rounded-xl" />
      ))}
    </div>
  );
}

export default function PurchaseHistoryPage() {
  const [companyId, setCompanyId] = useState<number | "">("");
  const [vendorId, setVendorId] = useState<number | "">("");
  const [productId, setProductId] = useState<number | "">("");
  const [scheduleId, setScheduleId] = useState<number | "">("");
  const [fromDate, setFromDate] = useState(thirtyDaysAgo());
  const [toDate, setToDate] = useState(today());
  const [productQuery, setProductQuery] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<FleaMarketCustomerSearchResult | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<PurchaseHistoryFilters>({ page: 1, limit: 25 });

  const debouncedCustomerQuery = useDebounce(customerQuery, 350);

  const optionsQuery = useQuery({
    queryKey: ["flea-market", "purchase-history", "filter-options"],
    queryFn: fetchPurchaseHistoryFilterOptions,
  });

  const customerSearchQuery = useQuery({
    queryKey: ["flea-market", "purchase-history", "customer-search", companyId, debouncedCustomerQuery],
    queryFn: () => searchFleaMarketCustomers(Number(companyId), debouncedCustomerQuery.trim()),
    enabled: companyId !== "" && !selectedCustomer && debouncedCustomerQuery.trim().length >= 3,
  });

  const reportQuery = useQuery({
    queryKey: ["flea-market", "purchase-history", appliedFilters],
    queryFn: () => fetchPurchaseHistory(appliedFilters),
  });

  const filteredProducts = useMemo(() => {
    const query = productQuery.trim().toLowerCase();
    const products = optionsQuery.data?.products ?? [];
    if (!query) return products.slice(0, 25);
    return products
      .filter((product) =>
        `${product.productName} ${product.brandName ?? ""}`.toLowerCase().includes(query),
      )
      .slice(0, 25);
  }, [optionsQuery.data?.products, productQuery]);

  const selectedProduct = optionsQuery.data?.products.find((product) => product.productId === productId);

  const applyFilters = (page = 1) => {
    setAppliedFilters({
      companyId: companyId === "" ? null : Number(companyId),
      vendorId: vendorId === "" ? null : Number(vendorId),
      productId: productId === "" ? null : Number(productId),
      userId: selectedCustomer?.userId ?? null,
      scheduleId: scheduleId === "" ? null : Number(scheduleId),
      fromDate,
      toDate,
      page,
      limit: appliedFilters.limit,
    });
  };

  const pagination = reportQuery.data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center w-10 h-10 text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78]">
          <FiClock className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-xl font-black text-gray-900">Purchase History</h1>
          <p className="text-sm text-gray-500">Find which customer bought which product from which vendor.</p>
        </div>
      </div>

      <SectionCard icon={FiFilter} title="Filters">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          <div>
            <label className="text-xs font-semibold text-slate-700">Company</label>
            <select value={companyId} onChange={(event) => setCompanyId(event.target.value ? Number(event.target.value) : "")} className={inputClass}>
              <option value="">All companies</option>
              {(optionsQuery.data?.companies ?? []).map((company) => (
                <option key={company.companyId} value={company.companyId}>
                  {company.companyName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">Vendor</label>
            <select value={vendorId} onChange={(event) => setVendorId(event.target.value ? Number(event.target.value) : "")} className={inputClass}>
              <option value="">All vendors</option>
              {(optionsQuery.data?.vendors ?? []).map((vendor) => (
                <option key={vendor.vendorId} value={vendor.vendorId}>
                  {vendor.vendorName}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <label className="text-xs font-semibold text-slate-700">Product</label>
            {selectedProduct ? (
              <div className="flex items-center justify-between px-3 py-2 mt-1 text-sm border border-emerald-200 rounded-lg bg-emerald-50">
                <span className="min-w-0 font-semibold text-emerald-800 truncate">{selectedProduct.productName}</span>
                <button type="button" onClick={() => setProductId("")} className="text-xs font-bold text-emerald-700 underline">
                  All
                </button>
              </div>
            ) : (
              <>
                <input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder="All products" className={inputClass} />
                {productQuery.trim() && (
                  <div className="absolute z-20 w-full mt-1 overflow-y-auto bg-white border border-gray-100 shadow-lg max-h-60 rounded-lg">
                    {filteredProducts.map((product) => (
                      <button
                        key={product.productId}
                        type="button"
                        onClick={() => {
                          setProductId(product.productId);
                          setProductQuery("");
                        }}
                        className="block w-full px-3 py-2 text-sm text-left border-b border-gray-50 last:border-b-0 hover:bg-gray-50"
                      >
                        {product.productName}
                      </button>
                    ))}
                    {filteredProducts.length === 0 && <p className="p-3 text-xs text-gray-400">No products found.</p>}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="relative">
            <label className="text-xs font-semibold text-slate-700">Customer</label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between px-3 py-2 mt-1 text-sm border border-emerald-200 rounded-lg bg-emerald-50">
                <span className="min-w-0 font-semibold text-emerald-800 truncate">{selectedCustomer.name}</span>
                <button type="button" onClick={() => setSelectedCustomer(null)} className="text-xs font-bold text-emerald-700 underline">
                  All
                </button>
              </div>
            ) : (
              <>
                <input
                  value={customerQuery}
                  onChange={(event) => setCustomerQuery(event.target.value)}
                  disabled={companyId === ""}
                  placeholder={companyId === "" ? "Select company first" : "Name, phone or email"}
                  className={inputClass}
                />
                {customerQuery.trim().length >= 3 && (
                  <div className="absolute z-20 w-full mt-1 overflow-y-auto bg-white border border-gray-100 shadow-lg max-h-60 rounded-lg">
                    {customerSearchQuery.isFetching && <p className="p-3 text-xs text-gray-400">Searching customers...</p>}
                    {(customerSearchQuery.data ?? []).map((customer) => (
                      <button
                        key={customer.userId}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setCustomerQuery("");
                        }}
                        className="block w-full px-3 py-2 text-sm text-left border-b border-gray-50 last:border-b-0 hover:bg-gray-50"
                      >
                        {customer.name}
                      </button>
                    ))}
                    {!customerSearchQuery.isFetching && (customerSearchQuery.data?.length ?? 0) === 0 && (
                      <p className="p-3 text-xs text-gray-400">No customers found.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">Event / Schedule</label>
            <select value={scheduleId} onChange={(event) => setScheduleId(event.target.value ? Number(event.target.value) : "")} className={inputClass}>
              <option value="">All events</option>
              {(optionsQuery.data?.schedules ?? []).map((schedule) => (
                <option key={schedule.scheduleId} value={schedule.scheduleId}>
                  {schedule.scheduledDate} - {schedule.locationName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">From Date</label>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className={inputClass} />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700">To Date</label>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className={inputClass} />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => applyFilters(1)}
              disabled={reportQuery.isFetching}
              className="w-full px-5 py-2.5 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20 disabled:opacity-60"
            >
              {reportQuery.isFetching ? "Loading..." : "Apply Filters"}
            </button>
          </div>
        </div>
      </SectionCard>

      {reportQuery.isLoading && <PurchaseHistorySkeleton />}

      {reportQuery.isError && (
        <ErrorState message="Unable to load purchase history." onRetry={() => void reportQuery.refetch()} />
      )}

      {reportQuery.data && reportQuery.data.rows.length === 0 && (
        <EmptyState icon={FiClock} title="No purchases found" description="No purchase history matches this selection." />
      )}

      {reportQuery.data && reportQuery.data.rows.length > 0 && (
        <div className="overflow-x-auto bg-white border border-gray-100 shadow-sm rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-[11px] font-bold tracking-wider text-left text-gray-500 uppercase">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-right">Unit Price</th>
                <th className="px-4 py-3 text-right">Points Redeemed</th>
                <th className="px-4 py-3 text-right">Amount Paid</th>
                <th className="px-4 py-3">Invoice #</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {reportQuery.data.rows.map((row) => (
                <tr key={`${row.invoiceId}-${row.productId}-${row.sku}`} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500">{new Date(row.invoiceDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{row.customerName}</td>
                  <td className="px-4 py-3 text-gray-700">{row.clientCompanyName}</td>
                  <td className="px-4 py-3 text-gray-700">{row.vendorName}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{row.productName}</td>
                  <td className="px-4 py-3 text-gray-500">{row.sku}</td>
                  <td className="px-4 py-3 text-right">{row.quantity}</td>
                  <td className="px-4 py-3 text-right">Rs {currency.format(row.unitPrice)}</td>
                  <td className="px-4 py-3 text-right text-amber-700">{currency.format(row.pointsRedeemed)} pts</td>
                  <td className="px-4 py-3 font-bold text-right text-gray-900">Rs {currency.format(row.amountPaid)}</td>
                  <td className="px-4 py-3">
                    <Link className="font-bold text-purple-700 hover:underline" to={`/flea-market/invoices/${row.invoiceId}`}>
                      {row.invoiceNumber}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination && (
        <div className="flex flex-col items-center justify-between gap-3 p-3 bg-white border border-gray-100 rounded-xl sm:flex-row">
          <p className="text-xs font-semibold text-gray-500">
            Page {pagination.page} of {pagination.totalPages} - {pagination.total.toLocaleString()} rows
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => applyFilters(Math.max(1, pagination.page - 1))}
              disabled={pagination.page <= 1 || reportQuery.isFetching}
              className="flex items-center gap-1 px-3 py-2 text-sm font-bold text-gray-700 border border-gray-200 rounded-lg disabled:opacity-40"
            >
              <FiChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              type="button"
              onClick={() => applyFilters(Math.min(pagination.totalPages, pagination.page + 1))}
              disabled={pagination.page >= pagination.totalPages || reportQuery.isFetching}
              className="flex items-center gap-1 px-3 py-2 text-sm font-bold text-gray-700 border border-gray-200 rounded-lg disabled:opacity-40"
            >
              Next
              <FiChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
