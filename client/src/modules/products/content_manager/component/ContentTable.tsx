import { useMemo, useState } from "react";
import { FaSpinner } from "react-icons/fa";
import { FiChevronLeft, FiChevronRight, FiCopy, FiEdit2, FiImage, FiLock, FiPause, FiSearch, FiTrash2 } from "react-icons/fi";
import type { ContentEntry, Status, Zone } from "../types";
import { STATUS_META, ZONES } from "../types";
import { computeStatus } from "../store";
import { cmsColorToBackground } from "../utils/cmsColor";
import StatusBadge from "./StatusBadge";

type SortKey = "newest" | "priority" | "startDate";

const PAGE_SIZE = 8;
const selectClass = "rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600 outline-none focus:border-purple-400";

interface Props {
  entries: ContentEntry[];
  now: Date;
  loading?: boolean;
  onEdit: (entry: ContentEntry) => void;
  onDuplicate: (entry: ContentEntry) => void;
  onDelete: (entry: ContentEntry) => void;
  onDeactivateNow: (entry: ContentEntry) => void;
}

const formatDate = (value: string) => (value ? new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export default function ContentTable({ entries, now, loading, onEdit, onDuplicate, onDelete, onDeactivateNow }: Props) {
  const [brokenImageIds, setBrokenImageIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState<Zone | "all">("all");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    let filtered = entries.filter((entry) => {
      if (zoneFilter !== "all" && entry.zone !== zoneFilter) return false;
      if (statusFilter !== "all" && computeStatus(entry, now) !== statusFilter) return false;
      if (search && !entry.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });

    filtered = [...filtered].sort((a, b) => {
      if (sortBy === "priority") return b.priority - a.priority;
      if (sortBy === "startDate") return (a.startAt || "").localeCompare(b.startAt || "");
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return filtered;
  }, [entries, zoneFilter, statusFilter, search, sortBy, now]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const goToPage = (next: number) => setPage(Math.min(Math.max(1, next), totalPages));

  return (
    <div className="overflow-hidden rounded-3xl border border-purple-100 bg-white shadow-[0_18px_55px_rgba(67,31,91,0.08)]">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-6 py-5">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search by title..."
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100"
          />
        </div>

        <select value={zoneFilter} onChange={(event) => { setZoneFilter(event.target.value as Zone | "all"); setPage(1); }} className={selectClass}>
          <option value="all">All Zones</option>
          {ZONES.map((zone) => <option key={zone.key} value={zone.key}>{zone.label}</option>)}
        </select>

        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as Status | "all"); setPage(1); }} className={selectClass}>
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
        </select>

        <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortKey)} className={selectClass}>
          <option value="newest">Sort: Newest</option>
          <option value="priority">Sort: Priority</option>
          <option value="startDate">Sort: Start Date</option>
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3">ID</th>
              <th className="px-5 py-3">Zone</th>
              <th className="px-5 py-3">Thumbnail</th>
              <th className="px-5 py-3">Title</th>
              <th className="px-5 py-3">Start</th>
              <th className="px-5 py-3">End</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Priority</th>
              <th className="px-5 py-3">Created By</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-400"><FaSpinner className="mx-auto animate-spin text-lg text-[#852BAF]" /></td></tr>
            )}
            {!loading && pageRows.map((entry) => {
              const status = computeStatus(entry, now);
              const zoneLabel = ZONES.find((zone) => zone.key === entry.zone)?.label;
              return (
                <tr key={entry.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-semibold text-slate-500">{entry.id}</td>
                  <td className="px-5 py-3 text-slate-700">{zoneLabel}</td>
                  <td className="px-5 py-3">
                    <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg border border-slate-100 text-[#852BAF]">
                      {entry.contentType === "image" && entry.imageUrl && !brokenImageIds.has(entry.id) ? (
                        <img
                          src={entry.imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={() => setBrokenImageIds((prev) => new Set(prev).add(entry.id))}
                        />
                      ) : entry.contentType === "color" ? (
                        <span className="h-full w-full" style={cmsColorToBackground(entry.colorValue)} />
                      ) : (
                        <FiImage />
                      )}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-bold text-slate-900">{entry.title}{entry.isDefault && <span className="ml-2 text-[10px] font-semibold text-slate-400">(Default)</span>}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{formatDate(entry.startAt)}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{formatDate(entry.endAt)}</td>
                  <td className="px-5 py-3"><StatusBadge status={status} /></td>
                  <td className="px-5 py-3 text-slate-700">{entry.priority}</td>
                  <td className="px-5 py-3 text-xs text-slate-500">{entry.createdBy}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => onEdit(entry)} title="Edit" className="rounded-lg p-2 text-slate-500 hover:bg-purple-50 hover:text-[#852BAF]"><FiEdit2 /></button>
                      <button onClick={() => onDuplicate(entry)} title="Duplicate" className="rounded-lg p-2 text-slate-500 hover:bg-purple-50 hover:text-[#852BAF]"><FiCopy /></button>
                      {(status === "active" || status === "scheduled") && (
                        <button onClick={() => onDeactivateNow(entry)} title="Deactivate Now" className="rounded-lg p-2 text-slate-500 hover:bg-amber-50 hover:text-amber-600"><FiPause /></button>
                      )}
                      {entry.isDefault ? (
                        <span title="Default entries cannot be deleted" className="rounded-lg p-2 text-slate-300"><FiLock /></span>
                      ) : (
                        <button onClick={() => onDelete(entry)} title="Delete" className="rounded-lg p-2 text-red-500 hover:bg-red-50 hover:text-red-600"><FiTrash2 /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && pageRows.length === 0 && (
              <tr><td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-400">No content entries match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-xs font-semibold text-slate-500">
        <span>{rows.length} {rows.length === 1 ? "entry" : "entries"} · Page {page} of {totalPages}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => goToPage(page - 1)} disabled={page === 1} className="rounded-lg border border-slate-200 p-2 disabled:cursor-not-allowed disabled:opacity-40"><FiChevronLeft /></button>
          <button onClick={() => goToPage(page + 1)} disabled={page === totalPages} className="rounded-lg border border-slate-200 p-2 disabled:cursor-not-allowed disabled:opacity-40"><FiChevronRight /></button>
        </div>
      </div>
    </div>
  );
}
