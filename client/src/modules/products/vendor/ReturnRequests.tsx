import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import { api } from "../../../common/api/api";
import ListPagination from "../../../common/components/ListPagination";

type Request = {
  request_id: number; request_type: "return" | "replacement"; status: "pending" | "approved" | "rejected";
  product_name: string; order_ref: string; vendor_order_id: number; quantity: number; reason: string;
  created_at: string; vendor_note: string | null; has_video?: boolean; video_url?: string | null;
};

export default function ReturnRequests() {
  const cache = useQueryClient();
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const list = useQuery({ queryKey: ["vendor-return-requests", status, page, pageSize], queryFn: async ({ signal }) => {
    const response = await api.get("/order/return-requests", { params: { status, page, limit: pageSize }, signal });
    return response.data as { rows: Request[]; total: number };
  }, refetchInterval: 30_000 });
  const detail = useQuery({ queryKey: ["vendor-return-request", selected], enabled: selected !== null, queryFn: async ({ signal }) => {
    const response = await api.get(`/order/return-requests/${selected}`, { signal });
    return response.data.data as Request;
  }, staleTime: 0 });
  const review = async (decision: "approved" | "rejected") => {
    if (!selected || saving) return;
    if (decision === "rejected" && !note.trim()) { setError("Enter a reason for rejecting this request."); return; }
    setSaving(true); setError("");
    try {
      await api.patch(`/order/return-requests/${selected}`, { status: decision, note });
      setPage(1);
      await Promise.all([cache.invalidateQueries({ queryKey: ["vendor-return-requests"] }), cache.invalidateQueries({ queryKey: ["vendor-return-request", selected] })]);
    } catch (e) { setError(isAxiosError(e) ? e.response?.data?.message || "Unable to update request." : "Unable to update request."); }
    finally { setSaving(false); }
  };
  return <div className="mx-auto max-w-7xl space-y-6">
    <header><h1 className="text-2xl font-semibold text-slate-900">Returns &amp; replacements</h1><p className="mt-1 text-sm text-slate-500">Review customer requests and damaged-product evidence.</p></header>
    <section className="overflow-hidden rounded-xl border border-purple-100 bg-white">
      <div className="flex flex-wrap gap-2 border-b border-purple-100 p-4">{["all", "pending", "approved", "rejected"].map(value => <button type="button" key={value} aria-pressed={status === value} onClick={() => { setStatus(value); setPage(1); }} className={`cursor-pointer rounded-lg px-4 py-2 text-sm capitalize ${status === value ? "bg-purple-50 font-semibold text-[#852BAF]" : "text-slate-500 hover:bg-slate-50"}`}>{value}</button>)}</div>
      {list.isPending ? <p role="status" className="p-10 text-center text-slate-500">Loading requests...</p> : list.isError ? <div role="alert" className="p-10 text-center text-red-600">Unable to load requests. <button type="button" onClick={() => void list.refetch()} className="cursor-pointer underline">Retry</button></div> : <>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{["Request", "Order / product", "Quantity", "Status", "Received", "Action"].map(label => <th key={label} className="px-5 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{list.data.rows.map(row => <tr key={row.request_id}>
          <td className="px-5 py-4 capitalize">#{row.request_id} · {row.request_type}</td><td className="px-5 py-4"><p className="font-medium">{row.product_name}</p><Link className="text-xs text-[#852BAF] hover:underline" to={`/vendor/orders/details/${row.vendor_order_id}`}>{row.order_ref}</Link></td><td className="px-5 py-4">{row.quantity}</td><td className="px-5 py-4 capitalize">{row.status}</td><td className="px-5 py-4 whitespace-nowrap">{new Date(row.created_at).toLocaleDateString()}</td><td className="px-5 py-4"><button type="button" onClick={() => { setSelected(row.request_id); setNote(""); setError(""); }} className="cursor-pointer whitespace-nowrap rounded-lg border border-purple-200 px-3 py-2 text-[#852BAF] hover:bg-purple-50">View request</button></td>
        </tr>)}</tbody></table></div>
        {!list.data.rows.length && <p className="p-10 text-center text-sm text-slate-500">No {status === "all" ? "" : status} requests found.</p>}
        <ListPagination total={list.data.total} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
      </>}
    </section>
    {selected !== null && <section aria-label="Request details" className="rounded-xl border border-purple-100 bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4"><h2 className="text-lg font-semibold">Request #{selected}</h2><button type="button" disabled={saving} onClick={() => setSelected(null)} className="cursor-pointer rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-50">Close details</button></div>
      {detail.isPending ? <p className="mt-4">Loading details...</p> : detail.isError ? <p role="alert" className="mt-4 text-red-600">Unable to load details. <button className="underline" onClick={() => void detail.refetch()}>Retry</button></p> : detail.data && <div className="mt-4 space-y-4">
        <p className="font-medium">{detail.data.product_name} · {detail.data.request_type}</p><p className="whitespace-pre-wrap break-words text-sm text-slate-600">{detail.data.reason}</p>
        {detail.data.video_url ? <div><p className="mb-2 text-sm font-medium">Damaged-product video</p><video key={detail.data.video_url} src={detail.data.video_url} controls preload="metadata" className="max-h-80 w-full max-w-xl rounded-lg bg-black" /><button type="button" onClick={() => void detail.refetch()} className="mt-2 cursor-pointer text-xs text-[#852BAF] underline">Refresh video link</button></div> : <p className="text-sm text-slate-500">No video attached.</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {detail.data.status === "pending" ? <><label className="block text-sm font-medium">Review note <span className="font-normal text-slate-500">(required when rejecting)</span><textarea value={note} onChange={e => setNote(e.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-lg border border-slate-200 p-3" /></label><p className="text-xs text-slate-500">Approval records your decision. Pickup, refund and replacement dispatch must be arranged separately.</p><div className="flex gap-3"><button type="button" disabled={saving} onClick={() => void review("approved")} className="cursor-pointer rounded-lg bg-[#852BAF] px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? "Saving..." : "Approve request"}</button><button type="button" disabled={saving} onClick={() => void review("rejected")} className="cursor-pointer rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 disabled:opacity-50">Reject request</button></div></> : <div className="rounded-lg bg-slate-50 p-4 text-sm"><p className="font-medium capitalize">{detail.data.status}</p>{detail.data.vendor_note && <p className="mt-1 whitespace-pre-wrap">{detail.data.vendor_note}</p>}</div>}
      </div>}
    </section>}
  </div>;
}
