import { useCallback, useEffect, useMemo, useState } from "react";
import { FiDownload, FiRefreshCw, FiUsers } from "react-icons/fi";
import { api } from "../../../common/api/api";

interface InactiveUser {
  id: number;
  company_id: number | null;
  company_name: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  role: string | null;
}

const columns: [keyof InactiveUser, string][] = [
  ["id", "Employee ID"], ["name", "Name"], ["company_name", "Company"],
  ["email", "Email"], ["phone", "Phone"], ["department", "Department"], ["role", "Role"],
];

export default function InactiveUsersReportPage() {
  const [rows, setRows] = useState<InactiveUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/manager-reports/inactive-users");
      setRows(response.data.rows || []);
    } catch {
      setRows([]);
      setError("Unable to load inactive users. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const companies = useMemo(() => Array.from(new Map(rows.map((row) => [
    String(row.company_id ?? "unassigned"), row.company_name || "Unassigned",
  ])).entries()).sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => (!company || String(row.company_id ?? "unassigned") === company)
      && columns.some(([key]) => String(row[key] ?? "").toLowerCase().includes(query)));
  }, [rows, search, company]);

  const download = () => {
    const escape = (value: unknown) => {
      const text = String(value ?? "");
      const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const csv = [columns.map(([, label]) => escape(label)).join(","),
      ...filtered.map((row) => columns.map(([key]) => escape(row[key])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `rm-inactive-users-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-full bg-gradient-to-br from-[#fdf8ff] via-white to-[#fff5f8] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col justify-between gap-5 rounded-3xl bg-gradient-to-br from-[#25103d] via-[#68258d] to-[#c33076] p-6 text-white sm:flex-row sm:items-center sm:p-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-purple-200">RM analytics</p>
            <h1 className="mt-2 flex items-center gap-3 text-2xl font-extrabold"><FiUsers /> Inactive Users Report</h1>
            <p className="mt-2 text-sm text-purple-100">All employees marked inactive in the company directory.</p>
          </div>
          <button disabled={loading || !!error || !filtered.length} onClick={download} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#68258d] disabled:opacity-50"><FiDownload /> Download CSV</button>
        </header>
        <section className="rounded-2xl border border-purple-100 bg-white p-5">
          <p className="text-sm text-slate-500">Total inactive users</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{loading || error ? "—" : rows.length}</p>
        </section>
        <section className="flex flex-col gap-3 rounded-2xl border border-purple-100 bg-white p-4 md:flex-row">
          <input aria-label="Search inactive users" placeholder="Search name, email, phone or department..." value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm" />
          <select aria-label="Filter by company" value={company} onChange={(event) => setCompany(event.target.value)} className="rounded-xl border border-slate-200 px-4 py-3 text-sm">
            <option value="">All companies</option>
            {companies.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <button disabled={loading} onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#852BAF] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"><FiRefreshCw className={loading ? "animate-spin" : ""} /> Refresh</button>
        </section>
        <section className="overflow-hidden rounded-3xl border border-purple-100 bg-white">
          {loading ? <p role="status" className="p-12 text-center text-slate-500">Loading inactive users...</p>
            : error ? <p role="alert" className="p-12 text-center text-red-600">{error}</p>
              : <>
                <p className="px-5 py-4 text-sm text-slate-500">Showing {filtered.length} of {rows.length} inactive users. CSV includes the filtered results.</p>
                <div className="overflow-x-auto"><table className="min-w-full whitespace-nowrap text-left text-sm">
                  <thead className="bg-purple-50 text-xs uppercase text-slate-500"><tr>{columns.map(([key, label]) => <th key={key} className="px-5 py-4">{label}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-100">{filtered.map((row) => <tr key={row.id} className="hover:bg-purple-50/30">{columns.map(([key]) => <td key={key} className="px-5 py-4 text-slate-600">{row[key] ?? "—"}</td>)}</tr>)}</tbody>
                </table></div>
                {!filtered.length && <p className="p-12 text-center text-sm text-slate-500">No inactive users found.</p>}
              </>}
        </section>
      </div>
    </main>
  );
}
