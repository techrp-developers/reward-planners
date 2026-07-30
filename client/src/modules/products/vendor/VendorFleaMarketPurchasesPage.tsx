import { useEffect, useState } from "react";
import { FiBox, FiCalendar, FiDollarSign, FiShoppingBag, FiTrendingUp } from "react-icons/fi";
import {
  fetchVendorFleaMarketPurchases,
  fetchVendorFleaMarketPurchasesFilterOptions,
  type VendorFleaMarketPurchaseRow,
  type VendorFleaMarketPurchasesSummary,
  type VendorFleaMarketScheduleOption,
} from "./api/vendorFleaMarketPurchasesApi";

const inputClass =
  "w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15";

const LIMIT = 20;

const currency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

export default function VendorFleaMarketPurchasesPage() {
  const [schedules, setSchedules] = useState<VendorFleaMarketScheduleOption[]>([]);
  const [scheduleId, setScheduleId] = useState<number | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [rows, setRows] = useState<VendorFleaMarketPurchaseRow[]>([]);
  const [summary, setSummary] = useState<VendorFleaMarketPurchasesSummary | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchVendorFleaMarketPurchasesFilterOptions()
      .then((data) => setSchedules(data.schedules))
      .catch((err) => console.error("Failed to load flea market filter options:", err));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await fetchVendorFleaMarketPurchases({
          scheduleId: scheduleId === "" ? null : scheduleId,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
          page,
          limit: LIMIT,
        });

        if (cancelled) return;
        setRows(data.rows);
        setSummary(data.summary);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load flea market purchases:", err);
        setError("Unable to load your flea market purchase history.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [scheduleId, fromDate, toDate, page]);

  const statCards = [
    { title: "Total Units Sold", value: (summary?.totalUnitsSold ?? 0).toLocaleString(), icon: FiShoppingBag, bg: "bg-purple-50", color: "text-[#852BAF]", border: "rgba(133,43,175,0.12)" },
    { title: "Total Revenue", value: currency(summary?.totalRevenue ?? 0), icon: FiDollarSign, bg: "bg-pink-50", color: "text-[#FC3F78]", border: "rgba(252,63,120,0.12)" },
    { title: "Total Orders", value: (summary?.totalOrders ?? 0).toLocaleString(), icon: FiTrendingUp, bg: "bg-emerald-50", color: "text-emerald-600", border: "rgba(16,185,129,0.15)" },
  ];

  return (
    <div>
      {/* PAGE HEADER */}
      <div
        className="flex items-center gap-4 mb-6 p-5 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div
          className="flex items-center justify-center shrink-0 w-11 h-11 rounded-2xl"
          style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 6px 18px rgba(133,43,175,0.28)" }}
        >
          <FiBox className="text-lg text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">
            Flea Market <span className="gradient-text-brand">Purchases</span>
          </h2>
          <p className="mt-0.5 text-xs font-medium text-gray-500">
            Which of your products sold, at which event, and who bought them.
          </p>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 gap-5 mb-6 sm:grid-cols-3">
        {statCards.map((card) => (
          <div
            key={card.title}
            className="p-6 bg-white rounded-2xl vendor-section-card"
            style={{ border: `1px solid ${card.border}`, boxShadow: "0 2px 16px rgba(133,43,175,0.04)" }}
          >
            <div className={`inline-flex p-3 rounded-2xl ${card.bg} ${card.color}`}>
              <card.icon size={22} />
            </div>
            <div className="mt-4">
              <p className="text-xs font-bold tracking-widest text-gray-400 uppercase">{card.title}</p>
              <h3 className="mt-1 text-2xl font-extrabold text-gray-800">{card.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* FILTERS */}
      <div
        className="grid grid-cols-1 gap-4 p-5 mb-6 bg-white rounded-2xl sm:grid-cols-4"
        style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}
      >
        <div>
          <label className="text-xs font-semibold text-gray-600">Event</label>
          <select
            value={scheduleId}
            onChange={(e) => {
              setScheduleId(e.target.value ? Number(e.target.value) : "");
              setPage(1);
            }}
            className={inputClass}
          >
            <option value="">All events</option>
            {schedules.map((schedule) => (
              <option key={schedule.scheduleId} value={schedule.scheduleId}>
                {schedule.scheduledDate} · {schedule.hostCompanyName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600">From Date</label>
          <input
            type="date"
            value={fromDate}
            disabled={scheduleId !== ""}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className={`${inputClass} disabled:bg-gray-50 disabled:text-gray-400`}
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600">To Date</label>
          <input
            type="date"
            value={toDate}
            disabled={scheduleId !== ""}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            className={`${inputClass} disabled:bg-gray-50 disabled:text-gray-400`}
          />
        </div>

        <div className="flex items-end">
          <button
            type="button"
            onClick={() => {
              setScheduleId("");
              setFromDate("");
              setToDate("");
              setPage(1);
            }}
            className="w-full px-4 py-2.5 text-sm font-bold text-gray-600 transition-colors border border-gray-200 rounded-xl hover:border-[#852BAF] hover:text-[#852BAF]"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* TABLE CARD */}
      <div
        className="overflow-hidden bg-white rounded-3xl"
        style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}
      >
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-4 border-purple-100 rounded-full border-t-[#852BAF] animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="m-6 p-4 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr style={{ background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.03) 100%)" }}>
                    {["Date", "Event", "Client Company", "Product", "SKU", "Qty", "Unit Price", "Line Total", "Customer"].map(
                      (h) => (
                        <th key={h} className="px-5 py-4 text-xs font-bold tracking-wider text-gray-500 uppercase">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-16 text-sm font-medium text-center text-gray-400">
                        No flea market purchases found for this selection.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={`${row.invoiceId}-${row.productId}-${row.sku}`}
                        className="transition-colors duration-150 hover:bg-purple-50/30"
                      >
                        <td className="px-5 py-4 text-gray-500 whitespace-nowrap">
                          {new Date(row.invoiceDate).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="px-5 py-4 text-gray-600 whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            <FiCalendar className="text-gray-300" size={13} />
                            {row.scheduledDate ?? "—"}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-gray-700">{row.clientCompanyName}</td>
                        <td className="px-5 py-4 font-semibold text-gray-900">
                          {row.productName}
                          {row.brandName && <div className="text-xs font-normal text-gray-400">{row.brandName}</div>}
                        </td>
                        <td className="px-5 py-4 text-gray-500">{row.sku}</td>
                        <td className="px-5 py-4 text-right">{row.quantity}</td>
                        <td className="px-5 py-4 text-right">{currency(row.unitPrice)}</td>
                        <td className="px-5 py-4 font-bold text-right text-gray-900">{currency(row.lineTotal)}</td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="font-semibold text-gray-800">{row.customerNameMasked ?? "—"}</div>
                          <div className="text-xs text-gray-400">{row.customerPhoneMasked ?? "—"}</div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {rows.length > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 py-5 border-t border-gray-50 sm:flex-row px-5">
                <p className="text-xs font-semibold text-gray-500">
                  Page <span className="text-gray-900">{page}</span> of <span className="text-gray-900">{totalPages}</span> ·{" "}
                  {total.toLocaleString()} row{total === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((prev) => prev - 1)}
                    className="px-4 py-2 text-sm font-semibold text-white transition-all rounded-xl active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
                  >
                    ← Prev
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((prev) => prev + 1)}
                    className="px-4 py-2 text-sm font-semibold text-white transition-all rounded-xl active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
