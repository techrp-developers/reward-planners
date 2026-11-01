import { useEffect, useState } from "react";
import { api } from "../../../common/api/api";
import { useDebounce } from "../../../common/hooks/useDebounce";

interface WebsiteEnquiry {
  id: number;
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
  source_url: string | null;
  created_at: string;
}

function safeSource(value: string | null) {
  try {
    const url = new URL(value || "");
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export default function WebsiteEnquiries() {
  const [search, setSearch] = useState("");
  const query = useDebounce(search.trim(), 350);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<WebsiteEnquiry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api.get("/manager/website-enquiries", { params: { search: query, page }, signal: controller.signal })
      .then(({ data }) => {
        if (controller.signal.aborted) return;
        if (!data.success) throw new Error("Unable to load enquiries");
        setRows(data.data);
        setTotal(data.total);
      })
      .catch(() => { if (!controller.signal.aborted) setError("Unable to load website enquiries. Please try again."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, page, retry]);

  return <section className="space-y-5">
    <header>
      <h1 className="text-2xl font-semibold text-gray-900">Website Enquiries</h1>
      <p className="mt-1 text-sm text-gray-500">Messages submitted through the website contact form.</p>
    </header>
    <div className="overflow-hidden rounded-xl border border-purple-100 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-5">
        <label className="w-full sm:w-96">
          <span className="sr-only">Search website enquiries</span>
          <input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search name, email, phone or message…"
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#852BAF] focus:ring-2 focus:ring-purple-100" />
        </label>
        {!loading && !error && <span className="text-sm text-gray-500">{total} enquiries</span>}
      </div>
      {loading ? <p role="status" className="p-12 text-center text-gray-500">Loading website enquiries…</p>
        : error ? <div role="alert" className="p-10 text-center"><p className="text-red-600">{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mt-3 text-[#852BAF] underline">Retry</button></div>
        : rows.length === 0 ? <p className="p-12 text-center text-gray-500">{query ? "No website enquiries match your search." : "No website enquiries yet."}</p>
        : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr>
            <th className="p-5">Contact</th><th className="p-5">Enquiry</th><th className="p-5">Submitted</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">{rows.map(row => {
            const source = safeSource(row.source_url);
            return <tr key={row.id} className="align-top hover:bg-purple-50/20">
              <td className="p-5"><p className="font-semibold text-gray-900">{row.name}</p><p className="mt-1 break-all text-gray-600">{row.email}</p><p className="mt-1 text-gray-500">{row.phone}</p></td>
              <td className="min-w-64 max-w-xl p-5"><p className="font-semibold text-gray-900">#{row.id} — {row.subject}</p>
                <details className="mt-2"><summary className="cursor-pointer font-medium text-[#852BAF]">View message</summary><p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-4 leading-6 text-gray-700">{row.message}</p>
                  {row.source_url && <p className="mt-3 break-all text-xs text-gray-500">Source: {source ? <a href={source} target="_blank" rel="noopener noreferrer" className="text-[#852BAF] underline">{row.source_url}</a> : row.source_url}</p>}
                </details>
              </td>
              <td className="whitespace-nowrap p-5 text-gray-500">{new Date(row.created_at).toLocaleString()}</td>
            </tr>;
          })}</tbody>
        </table></div>}
      {!error && <div className="flex items-center justify-end gap-4 border-t border-gray-100 p-4 text-sm">
        <button type="button" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button>
        <span>Page {page} of {Math.max(1, Math.ceil(total / 20))}</span>
        <button type="button" disabled={loading || page * 20 >= total} onClick={() => setPage(value => value + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button>
      </div>}
    </div>
  </section>;
}
