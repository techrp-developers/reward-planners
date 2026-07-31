import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FiChevronLeft, FiChevronRight, FiList, FiSearch } from "react-icons/fi";
import { useDebounce } from "../../../../common/hooks/useDebounce";
import { fetchAllProducts, fetchAllProductsFilterOptions, type AllProductsFilters } from "../../api/fleaMarketAllProductsApi";
import SectionCard from "../ui/SectionCard";
import Avatar from "../ui/Avatar";
import { EmptyState, ErrorState } from "../ui/EmptyState";
import Skeleton from "../ui/Skeleton";

const inputClass =
  "w-full px-3 py-2 mt-1 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15";

const currency = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const LOW_STOCK_THRESHOLD = 5;

function AllProductsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map((item) => (
        <Skeleton key={item} className="h-14 rounded-xl" />
      ))}
    </div>
  );
}

// "—" rather than "0" — a genuine zero-value reward and "no active mapping
// at all" are indistinguishable to a cashier either way (nothing to give),
// and showing a bare 0 reads as "eligible but worth nothing" instead of
// "not eligible."
function RewardCell({ points }: { points: number }) {
  if (points <= 0) return <span className="text-gray-400">Not eligible</span>;
  return <span className="font-semibold text-gray-800">{points.toLocaleString()} pts</span>;
}

export default function AllProductsPage() {
  const [search, setSearch] = useState("");
  const [vendorId, setVendorId] = useState<number | "">("");
  const [page, setPage] = useState(1);
  const limit = 25;

  const debouncedSearch = useDebounce(search, 400);

  const filters: AllProductsFilters = {
    q: debouncedSearch.trim(),
    vendorId: vendorId === "" ? null : vendorId,
    page,
    limit,
  };

  const optionsQuery = useQuery({
    queryKey: ["flea-market", "all-products", "filter-options"],
    queryFn: fetchAllProductsFilterOptions,
  });

  const productsQuery = useQuery({
    queryKey: ["flea-market", "all-products", filters],
    queryFn: () => fetchAllProducts(filters),
  });

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleVendorChange = (value: string) => {
    setVendorId(value ? Number(value) : "");
    setPage(1);
  };

  const pagination = productsQuery.data?.pagination;
  const rows = productsQuery.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex items-center justify-center w-10 h-10 text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78]">
          <FiList className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-xl font-black text-gray-900">All Products</h1>
          <p className="text-sm text-gray-500">
            Every product in the catalog — existing and quick-created — with live pricing and reward eligibility.
          </p>
        </div>
      </div>

      <SectionCard icon={FiSearch} title="Filters">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-slate-700">Search</label>
            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Brand, product name, or SKU"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">Vendor</label>
            <select value={vendorId} onChange={(e) => handleVendorChange(e.target.value)} className={inputClass}>
              <option value="">All vendors</option>
              {(optionsQuery.data?.vendors ?? []).map((vendor) => (
                <option key={vendor.vendorId} value={vendor.vendorId}>
                  {vendor.vendorName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </SectionCard>

      {productsQuery.isLoading && <AllProductsSkeleton />}

      {productsQuery.isError && (
        <ErrorState message="Unable to load products." onRetry={() => void productsQuery.refetch()} />
      )}

      {productsQuery.data && rows.length === 0 && (
        <EmptyState icon={FiList} title="No products found" description="Try a different search or vendor filter." />
      )}

      {productsQuery.data && rows.length > 0 && (
        <div className="overflow-x-auto bg-white border border-gray-100 shadow-sm rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-[11px] font-bold tracking-wider text-left text-gray-500 uppercase">
                <th className="px-4 py-3">Image</th>
                <th className="px-4 py-3">Brand</th>
                <th className="px-4 py-3">Product Name</th>
                <th className="px-4 py-3 text-right">MRP</th>
                <th className="px-4 py-3 text-right">Selling Price</th>
                <th className="px-4 py-3 text-right">RP Price</th>
                <th className="px-4 py-3 text-right">Redeem Reward</th>
                <th className="px-4 py-3 text-right">Earn Reward</th>
                <th className="px-4 py-3 text-right">Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const isLowStock = row.currentStock > 0 && row.currentStock < LOW_STOCK_THRESHOLD;
                const isOutOfStock = row.currentStock <= 0;

                return (
                  <tr key={row.variantId} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Avatar name={row.productName} imageUrl={row.heroImage} size="md" />
                    </td>
                    <td className="px-4 py-3 text-gray-500">{row.brandName ?? "—"}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {row.productName}
                      <span className="block text-[11px] font-normal text-gray-400">{row.sku}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">Rs {currency.format(row.mrp)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">Rs {currency.format(row.sellingPrice)}</td>
                    <td className="px-4 py-3 text-right">
                      {row.canRedeem ? (
                        <>
                          {/* <span className="text-gray-400 line-through">Rs {currency.format(row.sellingPrice)}</span>{" "} */}
                          <span className="font-bold text-emerald-700">Rs {currency.format(row.rpPrice)}</span>
                        </>
                      ) : (
                        <span className="font-semibold text-gray-700">Rs {currency.format(row.rpPrice)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RewardCell points={row.redeemRewardPoints} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RewardCell points={row.earnRewardPoints} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`font-semibold ${
                          isOutOfStock ? "text-red-600" : isLowStock ? "text-amber-600" : "text-gray-700"
                        }`}
                      >
                        {row.currentStock.toLocaleString()}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex flex-col items-center justify-between gap-3 p-3 bg-white border border-gray-100 rounded-xl sm:flex-row">
          <p className="text-xs font-semibold text-gray-500">
            Page {pagination.page} of {pagination.totalPages} — {pagination.total.toLocaleString()} products
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={pagination.page <= 1 || productsQuery.isFetching}
              className="flex items-center gap-1 px-3 py-2 text-sm font-bold text-gray-700 border border-gray-200 rounded-lg disabled:opacity-40"
            >
              <FiChevronLeft className="w-4 h-4" />
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(pagination.totalPages, prev + 1))}
              disabled={pagination.page >= pagination.totalPages || productsQuery.isFetching}
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
