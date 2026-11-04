import { useCallback, useEffect, useMemo, useState } from "react";
import { FiEdit2, FiImage, FiPlus, FiRefreshCw, FiSearch, FiTrash2 } from "react-icons/fi";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { api } from "../../../../common/api/api";
import { routes } from "../../../../routes";
import { POSTER_PLACEMENTS, placementDetails, placementOf, type PosterPlacement } from "./posterPlacement";

type Status = "draft" | "active" | "archived";
interface Poster {
  campaign_id: number;
  title: string;
  campaign_type: string;
  module: string;
  banner_image: string | null;
  start_at: string | null;
  end_at: string | null;
  status: Status;
  display_order: number;
  redirect_type: string | null;
  redirect_screen: string | null;
}

const date = (value: string | null) => value ? new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;
const expired = (poster: Poster) => Boolean(poster.end_at) && new Date(poster.end_at as string) < new Date();
const scheduled = (poster: Poster) => Boolean(poster.start_at) && new Date(poster.start_at as string) > new Date();

export default function PosterList() {
  const [posters, setPosters] = useState<Poster[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [placement, setPlacement] = useState<"all" | PosterPlacement>("all");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [home, dashboard] = await Promise.all([
        api.get("/campaign/campaigns", { params: { campaign_type: "poster" } }),
        api.get("/campaign/campaigns", { params: { campaign_type: "dashboard_poster" } }),
      ]);
      setPosters([...(home.data?.data || []), ...(dashboard.data?.data || [])]);
    } catch {
      await Swal.fire("Unable to load posters", "Please try again.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => posters.filter((poster) =>
    (placement === "all" || placementOf(poster.campaign_type, poster.module) === placement)
    && poster.title.toLowerCase().includes(search.toLowerCase())), [posters, placement, search]);

  const updateStatus = async (poster: Poster, status: Status) => {
    await api.patch(`/campaign/campaigns/${poster.campaign_id}/status`, { status });
    await load();
  };

  const remove = async (poster: Poster) => {
    const result = await Swal.fire({ title: "Delete poster?", text: poster.title, icon: "warning", showCancelButton: true, confirmButtonText: "Delete", confirmButtonColor: "#DC2626" });
    if (!result.isConfirmed) return;
    await api.delete(`/campaign/campaigns/${poster.campaign_id}`);
    await load();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight text-slate-900">Posters</h1><p className="mt-1 text-sm text-slate-500">Place posters on the ecommerce home, service home, or main dashboard, and choose what each one opens.</p></div><Link to={routes.manager.posters.create} className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#852BAF] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#702393]"><FiPlus /> Create poster</Link></header>

      <section className="overflow-hidden rounded-3xl border border-purple-100 bg-white shadow-[0_18px_55px_rgba(67,31,91,0.08)]">
        <div className="flex flex-col gap-3 border-b border-gray-100 p-5 sm:flex-row">
          <label className="relative flex-1">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search posters..." className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-purple-400 focus:bg-white focus:ring-4 focus:ring-purple-100" />
          </label>
          <select value={placement} onChange={(event) => setPlacement(event.target.value as typeof placement)} className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold">
            <option value="all">All placements</option>
            {POSTER_PLACEMENTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
          <button type="button" onClick={() => void load()} aria-label="Refresh" className="grid h-11 w-11 place-items-center rounded-xl border border-gray-200 text-gray-500 hover:text-[#852BAF]"><FiRefreshCw /></button>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="grid min-h-72 place-items-center"><FiRefreshCw className="animate-spin text-3xl text-[#852BAF]" /></div>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-purple-50/60 text-[10px] font-black uppercase tracking-wider text-gray-500">
                <tr><th className="px-5 py-4">Poster</th><th className="px-5 py-4">Placement</th><th className="px-5 py-4">Opens</th><th className="px-5 py-4">Schedule</th><th className="px-5 py-4">Order</th><th className="px-5 py-4">Status</th><th className="px-5 py-4 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((poster) => (
                  <tr key={poster.campaign_id} className="hover:bg-purple-50/30">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {poster.banner_image ? <img src={poster.banner_image} alt="" className="h-12 w-20 rounded-xl object-cover" /> : <span className="grid h-12 w-20 place-items-center rounded-xl bg-purple-50 text-[#852BAF]"><FiImage /></span>}
                        <p className="font-extrabold text-gray-900">{poster.title}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs font-semibold text-gray-700">{placementDetails(placementOf(poster.campaign_type, poster.module)).label}</td>
                    <td className="px-5 py-4 text-xs capitalize text-gray-600">{poster.redirect_screen || (poster.redirect_type ? poster.redirect_type.replaceAll("_", " ") : "Nothing")}</td>
                    <td className="px-5 py-4">
                      <p className="text-xs font-semibold text-gray-700">{date(poster.start_at) || "No start date"}</p>
                      <p className="mt-1 text-xs text-gray-400">to {date(poster.end_at) || "no end date"}</p>
                      {expired(poster) && <p className="mt-1 text-[11px] font-bold text-red-600">Ended, hidden in the app</p>}
                      {scheduled(poster) && <p className="mt-1 text-[11px] font-bold text-amber-600">Not started yet</p>}
                    </td>
                    <td className="px-5 py-4 font-bold text-gray-600">#{poster.display_order}</td>
                    <td className="px-5 py-4">
                      <select value={poster.status} onChange={(event) => void updateStatus(poster, event.target.value as Status)} className={`rounded-full border-0 px-3 py-1.5 text-xs font-extrabold capitalize ${poster.status === "active" ? "bg-emerald-50 text-emerald-700" : poster.status === "draft" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                        <option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option>
                      </select>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Link to={routes.manager.posters.edit.replace(":id", String(poster.campaign_id))} aria-label={`Edit ${poster.title}`} className="grid h-9 w-9 place-items-center rounded-xl bg-purple-50 text-[#852BAF] hover:bg-[#852BAF] hover:text-white"><FiEdit2 /></Link>
                        <button type="button" onClick={() => void remove(poster)} aria-label={`Delete ${poster.title}`} className="grid h-9 w-9 place-items-center rounded-xl bg-red-50 text-red-600 hover:bg-red-600 hover:text-white"><FiTrash2 /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && !filtered.length && <p className="p-16 text-center text-sm text-gray-400">No posters match these filters.</p>}
        </div>
      </section>
    </div>
  );
}
