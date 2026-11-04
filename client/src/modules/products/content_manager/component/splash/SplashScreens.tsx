import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { FiCopy, FiEdit2, FiEye, FiImage, FiPlus, FiPower, FiRefreshCw, FiSearch, FiTrash2 } from "react-icons/fi";
import { toast } from "sonner";
import Swal from "sweetalert2";
import { deleteEntry, duplicateEntry, updateEntry } from "../../api/ContentApi";
import {
  createSplashPlacement, deleteSplashPlacement, getSplashRegistry, listSplashDefaults, listSplashPlacements, splashError, updateSplashPlacement,
  type SplashPlacement, type SplashRegistry, type SplashStatus,
} from "../../api/SplashscreenApi";
import { AUDIENCE_LABELS, FREQUENCY_LABELS, PLATFORM_LABELS, formatIst } from "../../utils/splash";
import SplashBackendPreview from "./SplashBackendPreview";
import SplashCampaignEditor from "./SplashCampaignEditor";
import SplashDefaults from "./SplashDefaults";
import SplashStatusBadge from "./SplashStatusBadge";

type Tab = "all" | Exclude<SplashStatus, "disabled"> | "defaults" | "preview";
const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All campaigns" }, { key: "live", label: "Live" }, { key: "scheduled", label: "Scheduled" },
  { key: "draft", label: "Drafts" }, { key: "expired", label: "Expired" }, { key: "defaults", label: "Default splash screens" },
  { key: "preview", label: "Server preview" },
];
const PAGE_SIZE = 10;
const field = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100";

export default function SplashScreens() {
  const registry = useQuery({ queryKey: ["content", "splash", "registry"], queryFn: getSplashRegistry, retry: false, staleTime: 5 * 60_000 });

  if (registry.isError) {
    return (
      <main className="space-y-4">
        <Header />
        <div className="rounded-xl border border-rose-100 bg-rose-50 p-6 text-sm text-rose-700">
          {splashError(registry.error, "The Splash Screen Manager could not be loaded.")}
          <button type="button" onClick={() => void registry.refetch()} className="ml-3 inline-flex items-center gap-1 font-semibold underline"><FiRefreshCw /> Retry</button>
        </div>
      </main>
    );
  }
  if (registry.isPending) return <main className="space-y-4"><Header /><p className="text-sm text-slate-500">Loading…</p></main>;
  return <Manager registry={registry.data} />;
}

function Header({ onCreate }: { onCreate?: () => void }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-purple-100 pb-5">
      <div>
        <p className="text-xs font-semibold text-[#852BAF]">Content management</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">Dynamic Splash Screen Manager</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">Create and manage mobile promotional splash screens, page-specific banners, schedules, and default campaigns.</p>
      </div>
      {onCreate && <button type="button" onClick={onCreate} className="inline-flex items-center gap-2 rounded-xl bg-[#852BAF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#6f2391]"><FiPlus /> Create Splash Campaign</button>}
    </header>
  );
}

function Manager({ registry }: { registry: SplashRegistry }) {
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [pageKey, setPageKey] = useState("");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ placement: SplashPlacement | null } | null>(null);
  const [preview, setPreview] = useState<SplashPlacement | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => { const timer = window.setTimeout(() => setDebounced(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => { setPage(1); }, [tab, debounced, pageKey]);

  const listing = tab !== "defaults" && tab !== "preview";
  const params = { status: tab === "all" || !listing ? undefined : tab, search: debounced || undefined, page_key: pageKey || undefined, page, pageSize: PAGE_SIZE };
  const list = useQuery({
    queryKey: ["content", "splash", "placements", params],
    queryFn: () => listSplashPlacements(params),
    placeholderData: keepPreviousData, retry: false, refetchInterval: 60_000,
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["content", "splash"] });
  const pageLabel = (key: string) => registry.pages.find((p) => p.key === key)?.label || key;
  const slotLabel = (pageKeyValue: string, slot: string) => registry.pages.find((p) => p.key === pageKeyValue)?.slots.find((s) => s.key === slot)?.label || slot;

  async function act(placement: SplashPlacement, run: () => Promise<string | null>) {
    if (busy !== null) return;
    setBusy(placement.id);
    try {
      const message = await run();
      if (message) toast.success(message);
      await refresh();
    } catch (error) {
      toast.error(splashError(error));
    } finally {
      setBusy(null);
    }
  }

  const toggle = (placement: SplashPlacement) => act(placement, async () => {
    await updateSplashPlacement(placement.id, { is_enabled: !placement.is_enabled });
    return placement.is_enabled ? "Placement disabled" : "Placement enabled";
  });

  const duplicate = (placement: SplashPlacement) => act(placement, async () => {
    const copy = await duplicateEntry(placement.content_id);
    try {
      const created = await createSplashPlacement({
        content_id: copy.content_id, page_key: placement.page_key, slot_key: placement.slot_key, platform: placement.platform,
        audience: placement.audience, frequency_rule: placement.frequency_rule, display_seconds: placement.display_seconds, is_enabled: false,
      });
      setEditor({ placement: created.placement });
      return "Duplicated as a disabled draft. Adjust it and publish when ready.";
    } catch (error) {
      await deleteEntry(copy.content_id).catch(() => undefined);
      throw error;
    }
  });

  const remove = async (placement: SplashPlacement) => {
    const [others, defaults] = await Promise.all([
      listSplashPlacements({ content_id: placement.content_id, pageSize: 2 }).catch(() => null),
      listSplashDefaults().catch(() => null),
    ]);
    const lastUse = Boolean(others && defaults && others.total <= 1 && !defaults.some((d) => d.default_content_id === placement.content_id));
    const result = await Swal.fire({
      title: "Remove this placement?",
      html: `“${placement.content.title}” will no longer show on ${pageLabel(placement.page_key)} · ${slotLabel(placement.page_key, placement.slot_key)}.<br/><br/>`
        + (lastUse ? "The campaign content stays in the CMS as an <b>unpublished draft</b>, so it does not reappear as a regular CMS banner." : "The campaign content is kept; it is still used elsewhere."),
      icon: "warning", showCancelButton: true, confirmButtonText: "Remove placement", confirmButtonColor: "#e11d48",
    });
    if (!result.isConfirmed) return;
    await act(placement, async () => {
      if (lastUse && placement.content.status !== "draft") {
        const form = new FormData();
        form.append("is_published", "false");
        await updateEntry(placement.content_id, form);
      }
      await deleteSplashPlacement(placement.id);
      return "Placement removed. The CMS content was kept.";
    });
  };

  const summary = list.data?.summary;
  const stats: [string, number | undefined, string][] = [
    ["Total campaigns", summary?.total, "text-slate-900"], ["Currently live", summary?.live, "text-emerald-600"],
    ["Scheduled", summary?.scheduled, "text-sky-600"], ["Expired", summary?.expired, "text-amber-600"], ["Disabled", summary?.disabled, "text-rose-600"],
  ];

  return (
    <main className="space-y-6">
      <Header onCreate={() => setEditor({ placement: null })} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Summary">
        {stats.map(([name, value, color]) => (
          <div key={name} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold text-slate-500">{name}</p>
            <p className={`mt-1 text-2xl font-bold ${color}`}>{value ?? "—"}</p>
          </div>
        ))}
      </section>

      <nav className="flex flex-wrap gap-2 border-b border-slate-100 pb-2" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === t.key ? "bg-[#852BAF] text-white" : "text-slate-600 hover:bg-purple-50"}`}>{t.label}</button>
        ))}
      </nav>

      {tab === "defaults" && <SplashDefaults registry={registry} />}
      {tab === "preview" && <SplashBackendPreview registry={registry} />}

      {listing && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[220px] flex-1"><FiSearch className="absolute left-3 top-3 text-slate-400" /><input className={`${field} w-full pl-9`} placeholder="Search campaign title" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search campaigns" /></div>
            <select className={field} value={pageKey} onChange={(e) => setPageKey(e.target.value)} aria-label="Filter by page">
              <option value="">All pages</option>
              {registry.pages.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>

          {list.isError ? (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">{splashError(list.error, "Campaigns could not be loaded")}
              <button type="button" onClick={() => void list.refetch()} className="ml-3 inline-flex items-center gap-1 font-semibold underline"><FiRefreshCw /> Retry</button></div>
          ) : list.isPending ? <p className="text-sm text-slate-500">Loading campaigns…</p> : list.data.placements.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center">
              <FiImage className="mx-auto text-slate-300" size={32} />
              <p className="mt-2 text-sm font-semibold text-slate-700">No campaigns {tab === "all" ? "yet" : "here"}</p>
              <p className="text-xs text-slate-500">Create a splash campaign to show it on a page of the app.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-[1100px] divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr>{["", "Campaign", "Page · position", "Platform · audience", "Starts (IST)", "Ends (IST)", "Priority", "Frequency", "Status", ""].map((h, i) => <th key={i} className="px-3 py-3">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {list.data.placements.map((p) => (
                    <tr key={p.id} className={busy === p.id ? "opacity-60" : undefined}>
                      <td className="px-3 py-2">{p.content.image_url ? <img src={p.content.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-400" title="No usable artwork"><FiImage /></span>}</td>
                      <td className="max-w-[220px] px-3 py-2"><p className="truncate font-semibold text-slate-900">{p.content.title}</p><p className="text-xs text-slate-400">CMS #{p.content_id}</p></td>
                      <td className="px-3 py-2"><p className="font-medium text-slate-800">{pageLabel(p.page_key)}</p><p className="text-xs text-slate-500">{slotLabel(p.page_key, p.slot_key)}</p></td>
                      <td className="px-3 py-2 text-xs text-slate-700">{PLATFORM_LABELS[p.platform]}<br />{AUDIENCE_LABELS[p.audience]}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">{p.content.starts_at ? formatIst(p.content.starts_at) : "Immediately"}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">{p.content.expires_at ? formatIst(p.content.expires_at) : "No expiry"}</td>
                      <td className="px-3 py-2 text-center font-semibold text-slate-800">{p.content.priority}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">{FREQUENCY_LABELS[p.frequency_rule]}{p.display_seconds ? ` · ${p.display_seconds}s` : ""}</td>
                      <td className="px-3 py-2"><SplashStatusBadge placement={p} /></td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <IconButton label="Preview" onClick={() => setPreview(p)}><FiEye /></IconButton>
                          <IconButton label="Edit" onClick={() => setEditor({ placement: p })} disabled={busy !== null}><FiEdit2 /></IconButton>
                          <IconButton label={p.is_enabled ? "Disable" : "Enable"} onClick={() => void toggle(p)} disabled={busy !== null}><FiPower className={p.is_enabled ? "text-emerald-600" : "text-slate-400"} /></IconButton>
                          <IconButton label="Duplicate" onClick={() => void duplicate(p)} disabled={busy !== null}><FiCopy /></IconButton>
                          <IconButton label="Remove placement" onClick={() => void remove(p)} disabled={busy !== null}><FiTrash2 className="text-rose-600" /></IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {list.data && list.data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, list.data.total)} of {list.data.total}</span>
              <div className="flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage((n) => n - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button>
                <button type="button" disabled={page * PAGE_SIZE >= list.data.total} onClick={() => setPage((n) => n + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </section>
      )}

      {editor && <SplashCampaignEditor registry={registry} placement={editor.placement} onClose={() => setEditor(null)} onSaved={() => void refresh()} />}

      {preview && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Preview">
          <div className="w-full max-w-5xl space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">Preview · {preview.content.title}</h2>
              <button type="button" onClick={() => setPreview(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold">Close</button></div>
            <SplashBackendPreview registry={registry} initial={{
              page_key: preview.page_key, slot_key: preview.slot_key,
              platform: preview.platform === "ios" ? "ios" : "android", audience: preview.audience === "guest" ? "guest" : "authenticated",
            }} />
          </div>
        </div>
      )}
    </main>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-purple-300 hover:text-[#852BAF] disabled:opacity-40">{children}</button>;
}
