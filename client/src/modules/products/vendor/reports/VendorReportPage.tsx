import { useCallback, useEffect, useMemo, useState } from "react";
import { FiBarChart2, FiBox, FiDownload, FiPackage, FiRefreshCw, FiSearch, FiShoppingCart, FiTrendingUp } from "react-icons/fi";
import { api } from "../../../../common/api/api";

export type VendorReportType = "stock" | "products" | "orders";
type ReportRow = Record<string, string | number | null>;
type ReportResponse = { success: boolean; rows: ReportRow[]; summary: Record<string, number> };

const configurations = {
  stock: {
    eyebrow: "Inventory intelligence", title: "Stock Report", description: "Monitor inventory health across every product variant.", Icon: FiBox,
    statuses: [["", "All stock"], ["in_stock", "In stock"], ["low_stock", "Low stock"], ["out_of_stock", "Out of stock"]],
    metrics: [["totalVariants", "Total variants"], ["totalUnits", "Units available"], ["lowStock", "Low stock"], ["outOfStock", "Out of stock"]],
    columns: [["product_name", "Product"], ["brand_name", "Brand"], ["sku", "SKU"], ["variant_attributes", "Variant"], ["stock", "Available stock"], ["sale_price", "Sale price"], ["is_visible", "Visibility"]],
  },
  products: {
    eyebrow: "Catalogue intelligence", title: "Product Report", description: "Review catalogue status, variants and available inventory.", Icon: FiPackage,
    statuses: [["", "All statuses"], ["pending", "Pending"], ["sent_for_approval", "Sent for approval"], ["approved", "Approved"], ["rejected", "Rejected"], ["resubmission", "Resubmission"]],
    metrics: [["totalProducts", "Total products"], ["approved", "Approved"], ["totalVariants", "Variants"], ["totalStock", "Available units"]],
    columns: [["product_id", "Product ID"], ["product_name", "Product"], ["brand_name", "Brand"], ["category_name", "Category"], ["subcategory_name", "Subcategory"], ["status", "Status"], ["variant_count", "Variants"], ["total_stock", "Stock"], ["created_at", "Created"]],
  },
  orders: {
    eyebrow: "Sales intelligence", title: "Order Report", description: "Track order value, fulfilment and delivery performance.", Icon: FiShoppingCart,
    statuses: [["", "All statuses"], ["pending", "Pending"], ["confirmed", "Confirmed"], ["shipped", "Shipped"], ["delivered", "Delivered"], ["cancelled", "Cancelled"]],
    metrics: [["totalOrders", "Total orders"], ["revenue", "Revenue"], ["units", "Units sold"], ["delivered", "Delivered"]],
    columns: [["order_ref", "Order"], ["vendor_total", "Order value"], ["shipping_status", "Status"], ["item_count", "Items"], ["units", "Units"], ["courier_name", "Courier"], ["awb_number", "AWB"], ["created_at", "Created"]],
  },
} satisfies Record<VendorReportType, { eyebrow: string; title: string; description: string; Icon: React.ElementType; statuses: string[][]; metrics: string[][]; columns: string[][] }>;

const moneyKeys = new Set(["sale_price", "vendor_total", "revenue"]);
const dateKeys = new Set(["created_at"]);
const formatValue = (key: string, value: ReportRow[string]) => {
  if (value === null || value === "") return "—";
  if (moneyKeys.has(key)) return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value));
  if (dateKeys.has(key)) return new Date(String(value)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  if (key === "is_visible") return Number(value) === 1 ? "Visible" : "Hidden";
  if (key === "variant_attributes") { try { const parsed = JSON.parse(String(value)); return Object.values(parsed).join(" / ") || "Default"; } catch { return String(value); } }
  return String(value).replaceAll("_", " ");
};

export default function VendorReportPage({ type }: { type: VendorReportType }) {
  const config = configurations[type];
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchReport = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await api.get<ReportResponse>(`/vendor-reports/${type}`, { params: { search: search.trim() || undefined, status: status || undefined, fromDate: fromDate || undefined, toDate: toDate || undefined } });
      setRows(response.data.rows || []); setSummary(response.data.summary || {});
    } catch { setRows([]); setSummary({}); setError("We couldn't load this report. Check the filters and try again."); }
    finally { setLoading(false); }
  }, [fromDate, search, status, toDate, type]);

  useEffect(() => { void fetchReport(); }, [type]);
  const metricCards = useMemo(() => config.metrics.map(([key, label]) => ({ key, label, value: summary[key] || 0 })), [config.metrics, summary]);

  const downloadCsv = () => {
    if (!rows.length) return;
    const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const csv = [config.columns.map(([, label]) => escape(label)).join(","), ...rows.map((row) => config.columns.map(([key]) => escape(formatValue(key, row[key]))).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `vendor-${type}-report-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <main className="min-h-full bg-gradient-to-br from-[#fdf8ff] via-white to-[#fff5f8] p-4 sm:p-6 lg:p-8">
    <section className="mx-auto max-w-[1500px] space-y-6">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#25103d] via-[#69258d] to-[#c33176] p-6 text-white shadow-[0_24px_65px_rgba(91,33,124,0.24)] sm:p-8">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div className="flex items-center gap-4"><div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/20 bg-white/10 shadow-inner"><config.Icon size={25} /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.24em] text-purple-200">{config.eyebrow}</p><h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">{config.title}</h1><p className="mt-1 text-sm text-purple-100/80">{config.description}</p></div></div><button type="button" onClick={downloadCsv} disabled={!rows.length || loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white px-5 py-3 text-sm font-bold text-[#69258d] shadow-lg transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"><FiDownload /> Download CSV</button></div>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map(({ key, label, value }, index) => <article key={key} className="rounded-2xl border border-purple-100 bg-white p-5 shadow-[0_12px_35px_rgba(67,31,91,0.07)]"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span><span className={`grid h-9 w-9 place-items-center rounded-xl ${index === 2 ? "bg-amber-50 text-amber-600" : index === 3 ? "bg-emerald-50 text-emerald-600" : "bg-purple-50 text-[#852BAF]"}`}>{index === 0 ? <FiBarChart2 /> : <FiTrendingUp />}</span></div><p className="mt-3 text-2xl font-black text-slate-900">{moneyKeys.has(key) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value) : value.toLocaleString("en-IN")}</p></article>)}</div>
      <section className="rounded-3xl border border-purple-100 bg-white p-5 shadow-[0_18px_55px_rgba(67,31,91,0.08)]"><div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_190px_170px_170px_auto]"><label className="relative"><FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={type === "orders" ? "Search order, courier or AWB" : "Search product, brand or SKU"} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none focus:border-purple-400 focus:bg-white focus:ring-4 focus:ring-purple-100" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-purple-400">{config.statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input aria-label="From date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-purple-400" /><input aria-label="To date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-purple-400" /><button onClick={() => void fetchReport()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-5 py-3 text-sm font-bold text-white shadow-lg"><FiRefreshCw className={loading ? "animate-spin" : ""} /> Apply</button></div></section>
      <section className="overflow-hidden rounded-3xl border border-purple-100 bg-white shadow-[0_18px_55px_rgba(67,31,91,0.08)]"><div className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div><h2 className="font-extrabold text-slate-900">Report details</h2><p className="text-xs text-slate-400">{rows.length.toLocaleString()} matching records</p></div></div><div className="overflow-x-auto">{loading ? <div className="grid min-h-64 place-items-center text-sm font-semibold text-[#852BAF]"><FiRefreshCw className="mb-3 animate-spin text-2xl" />Preparing report...</div> : error ? <div className="grid min-h-64 place-items-center px-6 text-center text-sm font-semibold text-red-500">{error}</div> : !rows.length ? <div className="grid min-h-64 place-items-center px-6 text-center text-sm text-slate-400">No records match the selected filters.</div> : <table className="min-w-full whitespace-nowrap text-left"><thead className="bg-purple-50/60 text-[10px] font-extrabold uppercase tracking-wider text-slate-500"><tr>{config.columns.map(([key, label]) => <th key={key} className="px-5 py-4">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, index) => <tr key={`${type}-${String(row.product_id || row.variant_id || row.vendor_order_id || index)}`} className="transition hover:bg-purple-50/30">{config.columns.map(([key]) => <td key={key} className="px-5 py-4 text-sm text-slate-600"><span className={key.includes("status") ? "rounded-full bg-purple-50 px-2.5 py-1 text-xs font-bold capitalize text-[#852BAF]" : key === "product_name" || key === "order_ref" ? "font-bold text-slate-900" : ""}>{formatValue(key, row[key])}</span></td>)}</tr>)}</tbody></table>}</div></section>
    </section>
  </main>;
}
