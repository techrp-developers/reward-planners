import { useCallback, useEffect, useState } from "react";
import { FiBarChart2, FiCalendar, FiDownload, FiRefreshCw } from "react-icons/fi";
import Swal from "sweetalert2";
import { api } from "../../../common/api/api";

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
    <main className="min-h-full bg-gradient-to-br from-[#fdf8ff] via-white to-[#fff5f8] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#25103d] via-[#68258d] to-[#c33076] p-6 text-white shadow-[0_24px_65px_rgba(91,33,124,0.24)] sm:p-8">
          <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-4">
              <span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/20 bg-white/10">
                <FiBarChart2 size={25} />
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-purple-200">RM analytics</p>
                <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Module Usage Report</h1>
                <p className="mt-1 text-sm text-purple-100/80">Compare adoption across Step Counter, Ecommerce, Service and BBPS.</p>
              </div>
            </div>
            <button disabled={!rows.length} onClick={download} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#68258d] disabled:opacity-50">
              <FiDownload /> Download CSV
            </button>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2">
          {metrics.map(([key, label]) => (
            <article key={key} className="rounded-2xl border border-purple-100 bg-white p-5 shadow-[0_12px_35px_rgba(67,31,91,0.07)]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
              <p className="mt-3 text-2xl font-black text-slate-900">{String(summary[key] ?? 0)}</p>
            </article>
          ))}
        </section>

        <section className="rounded-3xl border border-purple-100 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-[1fr_170px_170px_auto]">
            <div className="hidden md:block" />
            <label className="relative">
              <FiCalendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-9 pr-2 text-sm" />
            </label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm" />
            <button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-5 py-3 text-sm font-bold text-white">
              <FiRefreshCw className={loading ? "animate-spin" : ""} /> Apply
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-purple-100 bg-white shadow-[0_18px_55px_rgba(67,31,91,0.08)]">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="grid min-h-72 place-items-center font-bold text-[#852BAF]"><FiRefreshCw className="animate-spin text-2xl" /></div>
            ) : !rows.length ? (
              <div className="grid min-h-72 place-items-center text-sm text-slate-400">No report data found.</div>
            ) : (
              <table className="min-w-full whitespace-nowrap text-left">
                <thead className="bg-purple-50/60 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                  <tr>{columns.map(([key, label]) => <th key={key} className="px-5 py-4">{label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row, index) => (
                    <tr key={String(row.module || index)} className="hover:bg-purple-50/30">
                      {columns.map(([key]) => (
                        <td key={key} className="px-5 py-4 text-sm text-slate-600">
                          <span className={key === "module" ? "font-bold text-slate-900" : ""}>{show(key, row[key])}</span>
                        </td>
                      ))}
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
