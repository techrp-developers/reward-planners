import { useCallback, useEffect, useState } from "react";
import { FiBarChart2, FiCalendar, FiChevronRight, FiDownload, FiRefreshCw } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { api } from "../../../common/api/api";
import { routes } from "../../../routes";

type Row = Record<string, string | number | null>;
const columns: [string, string][] = [
  ["module", "Module"],
  ["active_users", "Active users"],
  ["activities", "Activities"],
  ["usage_share", "Usage share"],
];
const show = (key: string, value: Row[string]) => {
  if (value == null || value === "") return "—";
  if (key === "usage_share") return `${value}%`;
  return String(value).replaceAll("_", " ");
};

export default function RmReportPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const navigate = useNavigate();

  const openModuleUsers = (row: Row) => {
    if (!row.key) return;
    const query = fromDate && toDate ? `?${new URLSearchParams({ fromDate, toDate })}` : "";
    navigate(`${routes.rm.reports.usageUsers.replace(":module", String(row.key))}${query}`);
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get("/manager-reports/usage", {
        params: { fromDate: fromDate || undefined, toDate: toDate || undefined },
      });
      setRows(response.data.rows || []);
      setSummary(response.data.summary || {});
    } catch {
      setRows([]);
      await Swal.fire("Unable to load report", "Please check the selected filters and try again.", "error");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 350);
    return () => window.clearTimeout(timer);
  }, [load]);

  const download = () => {
    if (!rows.length) return;
    const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const csv = [
      columns.map(([, label]) => esc(label)).join(","),
      ...rows.map((row) => columns.map(([key]) => esc(show(key, row[key]))).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "rm-usage-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const metrics: [string, string][] = [["totalActivities", "Total activities"], ["leadingModule", "Leading module"]];

  return (
    <main className="min-h-full">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="relative overflow-hidden rounded-xl text-slate-900">
          <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-purple-50 text-[#852BAF]">
                <FiBarChart2 size={25} />
              </span>
              <div>
                <p className="text-xs font-medium text-[#852BAF]">RM analytics</p>
                <h1 className="mt-1 text-2xl font-semibold ">Module Usage Report</h1>
                <p className="mt-1 text-sm text-slate-500">Compare adoption across Step Counter, Ecommerce, Service and BBPS.</p>
              </div>
            </div>
            <button disabled={!rows.length} onClick={download} className="inline-flex items-center justify-center gap-2 rounded-lg border border-purple-100 bg-white px-4 py-2.5 text-sm font-bold text-[#68258d] disabled:opacity-50">
              <FiDownload /> Download CSV
            </button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          {metrics.map(([key, label]) => (
            <article key={key} className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
              <p className="mt-3 text-2xl font-semibold text-slate-900">{String(summary[key] ?? 0)}</p>
            </article>
          ))}
        </section>

        <section className="rounded-xl border border-purple-100 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_170px_170px_auto]">
            <div className="hidden md:block" />
            <label className="relative">
              <FiCalendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-9 pr-2 text-sm" />
            </label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm" />
            <button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#852BAF] hover:bg-[#702393] px-5 py-3 text-sm font-bold text-white">
              <FiRefreshCw className={loading ? "animate-spin" : ""} /> Apply
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-purple-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="grid min-h-72 place-items-center font-bold text-[#852BAF]"><FiRefreshCw className="animate-spin text-2xl" /></div>
            ) : !rows.length ? (
              <div className="grid min-h-72 place-items-center text-sm text-slate-400">No report data found.</div>
            ) : (
              <table className="min-w-full whitespace-nowrap text-left">
                <thead className="bg-purple-50/60 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>{columns.map(([key, label]) => <th key={key} className="px-5 py-4">{label}</th>)}<th className="px-5 py-4" /></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, index) => (
                    <tr key={String(row.module || index)} onClick={() => openModuleUsers(row)} className="cursor-pointer hover:bg-purple-50/30">
                      {columns.map(([key]) => (
                        <td key={key} className="px-5 py-4 text-sm text-slate-600">
                          <span className={key === "module" ? "font-bold text-slate-900" : ""}>{show(key, row[key])}</span>
                        </td>
                      ))}
                      <td className="px-5 py-4 text-right">
                        <button onClick={(e) => { e.stopPropagation(); openModuleUsers(row); }} className="inline-flex items-center gap-1 text-xs font-bold text-[#852BAF] hover:underline">
                          View users <FiChevronRight />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
