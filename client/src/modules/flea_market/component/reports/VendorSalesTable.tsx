import { Fragment, useMemo, useState } from "react";
import { FiChevronDown, FiChevronRight, FiChevronUp, FiDownload, FiSearch, FiX } from "react-icons/fi";
import type { VendorSalesVendor } from "../../api/fleaMarketReportsApi";

interface VendorSalesTableProps {
  vendors: VendorSalesVendor[];
}

// Truncates long vendor/product names to a single line instead of wrapping
// across 3-4 lines and blowing up row height — full text still available on
// hover via the title attribute.
function TruncatedCell({ text, className = "" }: { text: string; className?: string }) {
  return (
    <span className={`block truncate ${className}`} title={text}>
      {text}
    </span>
  );
}

type SortKey =
  | "vendorName"
  | "productName"
  | "sku"
  | "allocatedQty"
  | "soldQty"
  | "damagedQty"
  | "returnedQty"
  | "sellThroughPct"
  | "effectivePrice"
  | "grossRevenue";

type SortDirection = "asc" | "desc";

const currency = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const number = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 1,
});

function compareValues(a: string | number, b: string | number, direction: SortDirection) {
  const modifier = direction === "asc" ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * modifier;
  return String(a).localeCompare(String(b)) * modifier;
}

function sellThroughClass(value: number) {
  if (value > 70) return "bg-emerald-50 text-emerald-700 border-emerald-100";
  if (value >= 40) return "bg-amber-50 text-amber-700 border-amber-100";
  return "bg-red-50 text-red-700 border-red-100";
}

function csvCell(value: string | number) {
  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

function downloadCsv(vendors: VendorSalesVendor[]) {
  const rows = vendors.flatMap((vendor) =>
    vendor.productsSold.map((product) => [
      vendor.vendorName,
      product.productName,
      product.sku,
      product.allocatedQty,
      product.soldQty,
      product.damagedQty,
      product.returnedQty,
      product.sellThroughPct,
      product.effectivePrice,
      product.grossRevenue,
      vendor.totalPointsRedeemed,
      product.scheduledDate,
      product.clientCompanyName,
    ]),
  );

  const header = [
    "Vendor",
    "Product",
    "SKU",
    "Allocated",
    "Sold",
    "Damaged",
    "Returned",
    "Sell-Through %",
    "Unit Price",
    "Revenue",
    "Vendor Points Redeemed",
    "Scheduled Date",
    "Client Company",
  ];

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vendor-sales-report-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function SortHeader({
  label,
  column,
  sortKey,
  sortDirection,
  onSort,
}: {
  label: string;
  column: SortKey;
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
}) {
  return (
    <th className="px-4 py-3 text-left">
      <button
        type="button"
        onClick={() => onSort(column)}
        className="flex items-center gap-1 text-[11px] font-bold tracking-wider text-gray-500 uppercase hover:text-gray-900"
      >
        {label}
        {sortKey === column &&
          (sortDirection === "asc" ? <FiChevronUp className="w-3 h-3" /> : <FiChevronDown className="w-3 h-3" />)}
      </button>
    </th>
  );
}

export default function VendorSalesTable({ vendors }: VendorSalesTableProps) {
  const [collapsedVendorIds, setCollapsedVendorIds] = useState<Set<number>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("grossRevenue");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [searchText, setSearchText] = useState("");

  const sortedVendors = useMemo(() => {
    return vendors
      .map((vendor) => ({
        ...vendor,
        productsSold: [...vendor.productsSold].sort((a, b) => {
          const aValue = sortKey === "vendorName" ? vendor.vendorName : a[sortKey];
          const bValue = sortKey === "vendorName" ? vendor.vendorName : b[sortKey];
          return compareValues(aValue, bValue, sortDirection);
        }),
      }))
      .sort((a, b) => {
        if (sortKey === "vendorName") return compareValues(a.vendorName, b.vendorName, sortDirection);
        if (sortKey === "sellThroughPct") return compareValues(a.sellThroughPct, b.sellThroughPct, sortDirection);
        if (sortKey === "grossRevenue") return compareValues(a.totalRevenue, b.totalRevenue, sortDirection);
        if (sortKey === "soldQty") return compareValues(a.totalUnitsSold, b.totalUnitsSold, sortDirection);
        return compareValues(a.productsSold[0]?.[sortKey] ?? "", b.productsSold[0]?.[sortKey] ?? "", sortDirection);
      });
  }, [sortDirection, sortKey, vendors]);

  // Instant client-side narrowing on top of the server-filtered result set —
  // matching vendor name keeps the whole group, matching product/SKU narrows
  // to just those rows within an otherwise-non-matching vendor.
  const filteredVendors = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return sortedVendors;

    return sortedVendors.flatMap((vendor) => {
      if (vendor.vendorName.toLowerCase().includes(query)) return [vendor];

      const matchingProducts = vendor.productsSold.filter(
        (product) => product.productName.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query),
      );
      return matchingProducts.length > 0 ? [{ ...vendor, productsSold: matchingProducts }] : [];
    });
  }, [searchText, sortedVendors]);

  const totalProductRows = useMemo(
    () => filteredVendors.reduce((sum, vendor) => sum + vendor.productsSold.length, 0),
    [filteredVendors],
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "vendorName" || key === "productName" || key === "sku" ? "asc" : "desc");
  };

  const toggleVendor = (vendorId: number) => {
    setCollapsedVendorIds((prev) => {
      const next = new Set(prev);
      if (next.has(vendorId)) next.delete(vendorId);
      else next.add(vendorId);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <FiSearch className="absolute w-4 h-4 text-gray-400 -translate-y-1/2 left-3 top-1/2" />
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Filter by vendor, product or SKU..."
            className="w-full py-2 pl-9 pr-8 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => setSearchText("")}
              className="absolute -translate-y-1/2 right-2 top-1/2 text-gray-400 hover:text-gray-600"
            >
              <FiX className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold text-gray-500 shrink-0">
            {filteredVendors.length} vendor{filteredVendors.length === 1 ? "" : "s"} · {totalProductRows} product row
            {totalProductRows === 1 ? "" : "s"}
          </p>
          <button
            type="button"
            onClick={() => downloadCsv(filteredVendors)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-purple-700 transition-colors border border-purple-200 rounded-xl shrink-0 hover:bg-purple-50"
          >
            <FiDownload className="w-4 h-4" />
            Download as CSV
          </button>
        </div>
      </div>

      {filteredVendors.length === 0 ? (
        <p className="py-10 text-sm text-center text-gray-400">No rows match "{searchText}".</p>
      ) : (
        <div className="overflow-x-auto bg-white border border-gray-100 shadow-sm rounded-xl">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-[15%]" />
                <col className="w-[17%]" />
                <col className="w-[9%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[9%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
                <col className="w-[6%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr>
                  <SortHeader label="Vendor" column="vendorName" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <SortHeader label="Product" column="productName" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <SortHeader label="SKU" column="sku" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <SortHeader label="Allocated" column="allocatedQty" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <SortHeader label="Sold" column="soldQty" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <SortHeader label="Damaged" column="damagedQty" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <SortHeader label="Returned" column="returnedQty" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <SortHeader label="Sell-Through %" column="sellThroughPct" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <SortHeader label="Unit Price" column="effectivePrice" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <SortHeader label="Revenue" column="grossRevenue" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                  <th className="px-4 py-3 text-[11px] font-bold tracking-wider text-left text-gray-500 uppercase">
                    Points
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredVendors.map((vendor) => {
                  const collapsed = collapsedVendorIds.has(vendor.vendorId);
                  return (
                    <Fragment key={vendor.vendorId}>
                      <tr className="bg-slate-50/80">
                        <td className="px-4 py-3 font-black text-gray-900">
                          <button
                            type="button"
                            onClick={() => toggleVendor(vendor.vendorId)}
                            className="flex items-center w-full gap-2 min-w-0"
                          >
                            {collapsed ? (
                              <FiChevronRight className="w-4 h-4 shrink-0" />
                            ) : (
                              <FiChevronDown className="w-4 h-4 shrink-0" />
                            )}
                            <TruncatedCell text={vendor.vendorName} />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-gray-500" colSpan={2}>
                          {vendor.productsSold.length} product row{vendor.productsSold.length === 1 ? "" : "s"}
                        </td>
                        <td className="px-4 py-3 font-bold text-gray-700">{number.format(vendor.totalAllocated)}</td>
                        <td className="px-4 py-3 font-bold text-gray-700">{number.format(vendor.totalUnitsSold)}</td>
                        <td className="px-4 py-3 font-bold text-red-600">{number.format(vendor.totalDamaged)}</td>
                        <td className="px-4 py-3 font-bold text-gray-700">{number.format(vendor.totalReturned)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 text-xs font-bold border rounded-full ${sellThroughClass(vendor.sellThroughPct)}`}>
                            {vendor.sellThroughPct}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400">Subtotal</td>
                        <td className="px-4 py-3 font-black text-gray-900">Rs {currency.format(vendor.totalRevenue)}</td>
                        <td className="px-4 py-3 font-black text-amber-700">
                          {number.format(vendor.totalPointsRedeemed)} pts
                        </td>
                      </tr>

                      {!collapsed &&
                        vendor.productsSold.map((product) => (
                          <tr key={`${vendor.vendorId}-${product.scheduleId}-${product.variantId}`} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-400">
                              <TruncatedCell text={vendor.vendorName} />
                            </td>
                            <td className="px-4 py-3 font-semibold text-gray-800">
                              <TruncatedCell text={product.productName} />
                            </td>
                            <td className="px-4 py-3 text-gray-500">
                              <TruncatedCell text={product.sku} />
                            </td>
                            <td className="px-4 py-3 text-gray-700">{number.format(product.allocatedQty)}</td>
                            <td className="px-4 py-3 font-bold text-gray-900">{number.format(product.soldQty)}</td>
                            <td className="px-4 py-3 text-red-600">{number.format(product.damagedQty)}</td>
                            <td className="px-4 py-3 text-gray-700">{number.format(product.returnedQty)}</td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex px-2 py-1 text-xs font-bold border rounded-full ${sellThroughClass(product.sellThroughPct)}`}>
                                {product.sellThroughPct}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-700">Rs {currency.format(product.effectivePrice)}</td>
                            <td className="px-4 py-3 font-bold text-gray-900">
                              Rs {currency.format(product.grossRevenue)}
                            </td>
                            <td className="px-4 py-3 text-gray-400">In subtotal</td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
