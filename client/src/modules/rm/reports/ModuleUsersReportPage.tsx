import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FiArrowLeft, FiDownload, FiRefreshCw, FiUsers } from "react-icons/fi";
import { Link, useParams, useSearchParams } from "react-router-dom";
import ListPagination from "../../../common/components/ListPagination";
import { useListPagination } from "../../../common/hooks/useListPagination";
import { api } from "../../../common/api/api";
import { routes } from "../../../routes";

interface ModuleUser {
  user_id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  activities: number;
  last_activity: string | null;
}

const columns: [keyof ModuleUser, string][] = [
  ["user_id", "User ID"], ["name", "Name"], ["company_name", "Company"], ["email", "Email"],
  ["phone", "Phone"], ["activities", "Activities"], ["last_activity", "Last activity"],
];

const show = (key: keyof ModuleUser, value: ModuleUser[keyof ModuleUser]) => {
  if (value == null || value === "") return "—";
  if (key === "last_activity") return new Date(String(value)).toLocaleDateString();
  return String(value);
};

export default function ModuleUsersReportPage() {
  const { module = "" } = useParams();
  const [searchParams] = useSearchParams();
  const fromDate = searchParams.get("fromDate") || "";
  const toDate = searchParams.get("toDate") || "";
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");

  const { data, isPending: loading, isFetching, isError, refetch: load } = useQuery({
    queryKey: ["rm-module-users-report", module, fromDate, toDate],
    queryFn: async ({ signal }) => {
      const response = await api.get(`/manager-reports/usage/${module}/users`, {
        params: { fromDate: fromDate || undefined, toDate: toDate || undefined },
        signal,
      });
      return { module: String(response.data.module || module), rows: (response.data.rows || []) as ModuleUser[] };
    },
  });
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const moduleName = data?.module ?? module.replaceAll("_", " ");
  const error = isError ? "Unable to load module users. Please try again." : "";

  const companies = useMemo(() => Array.from(new Set(rows.map((row) => row.company_name || "Unassigned")))
    .sort((a, b) => a.localeCompare(b)), [rows]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => (!company || (row.company_name || "Unassigned") === company)
      && columns.some(([key]) => String(row[key] ?? "").toLowerCase().includes(query)));
  }, [rows, search, company]);

  const pagination = useListPagination(filtered.length, JSON.stringify([company, search]));
  const start = (pagination.page - 1) * pagination.pageSize;
  const pageRows = filtered.slice(start, start + pagination.pageSize);

  const download = () => {
    const escape = (value: unknown) => {
      const text = String(value ?? "");
      const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csv = [columns.map(([, label]) => escape(label)).join(","),
      ...filtered.map((row) => columns.map(([key]) => escape(show(key, row[key]))).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `rm-${module}-users-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-full">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col justify-between gap-5 rounded-xl text-slate-900 sm:flex-row sm:items-center">
          <div>
            <Link to={routes.rm.reports.usage} className="inline-flex items-center gap-1.5 text-xs font-bold text-[#852BAF] hover:underline"><FiArrowLeft /> Module usage</Link>
            <h1 className="mt-2 flex items-center gap-3 text-2xl font-semibold"><FiUsers /> {moduleName} — active users</h1>
            <p className="mt-2 text-sm text-slate-500">
              {fromDate && toDate ? `Activity between ${fromDate} and ${toDate}.` : "All-time activity."}
            </p>
          </div>
          <button disabled={loading || !!error || !filtered.length} onClick={download} className="inline-flex items-center justify-center gap-2 rounded-lg border border-purple-100 bg-white px-4 py-2.5 text-sm font-bold text-[#68258d] disabled:opacity-50"><FiDownload /> Download CSV</button>
        </header>
        <section className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-purple-100 bg-white p-5">
            <p className="text-sm text-slate-500">Matching active users</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{loading || error ? "—" : filtered.length}</p>
          </article>
          <article className="rounded-2xl border border-purple-100 bg-white p-5">
            <p className="text-sm text-slate-500">Activities by matching users</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{loading || error ? "—" : filtered.reduce((sum, row) => sum + row.activities, 0)}</p>
          </article>
        </section>
        <section className="flex flex-col gap-3 rounded-2xl border border-purple-100 bg-white p-4 md:flex-row">
          <input aria-label="Search active users" placeholder="Search name, email, phone or company..." value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm" />
          <select aria-label="Filter by company" value={company} onChange={(event) => setCompany(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
            <option value="">All companies</option>
            {companies.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <button disabled={isFetching} onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#852BAF] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"><FiRefreshCw className={isFetching ? "animate-spin" : ""} /> Refresh</button>
        </section>
        <section className="overflow-hidden rounded-xl border border-purple-100 bg-white">
          {loading ? <p role="status" className="p-12 text-center text-slate-500">Loading active users...</p>
            : error ? <p role="alert" className="p-12 text-center text-red-600">{error}</p>
              : <>
                <p className="px-5 py-4 text-sm text-slate-500">Showing {filtered.length} of {rows.length} active users. CSV includes all matching results.</p>
                <div className="overflow-x-auto"><table className="min-w-full whitespace-nowrap text-left text-sm">
                  <thead className="bg-purple-50 text-xs uppercase text-slate-500"><tr>{columns.map(([key, label]) => <th key={key} className="px-5 py-4">{label}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-100">{pageRows.map((row) => <tr key={row.user_id} className="hover:bg-purple-50/30">{columns.map(([key]) => <td key={key} className="px-5 py-4 text-slate-600">{show(key, row[key])}</td>)}</tr>)}</tbody>
                </table></div>
                {!filtered.length && <p className="p-12 text-center text-sm text-slate-500">No active users match these filters.</p>}
                <ListPagination {...pagination} />
              </>}
        </section>
      </div>
    </main>
  );
}
