import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FiEdit2, FiImage, FiRefreshCw, FiUpload } from "react-icons/fi";
import { toast } from "sonner";
import {
  buildEntryFormData, createEntry, deleteEntry, duplicateEntry, listEntries, updateEntry, type ApiContentEntry,
} from "../../api/ContentApi";
import {
  listSplashDefaults, listSplashPlacements, saveSplashDefault, splashError,
  type SplashDefault, type SplashFallbackPolicy, type SplashPlatform, type SplashRegistry,
} from "../../api/SplashscreenApi";
import { fromApiEntry } from "../../store/mappers";
import { PLATFORM_LABELS, nowIstInput } from "../../utils/splash";

const field = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100";
type ContentChoice = "keep" | "upload" | "existing";

interface Editing { page_key: string; slot_key: string; platform: SplashPlatform; current: SplashDefault | null }

/** Content that is no longer used by any campaign is unpublished, so it does not reappear as an ordinary CMS banner. */
async function retireIfUnused(contentId: number, defaults: SplashDefault[], keep: SplashDefault | null) {
  const stillDefault = defaults.some((d) => d.default_content_id === contentId && !(keep && d.id === keep.id));
  if (stillDefault) return;
  const placed = await listSplashPlacements({ content_id: contentId, pageSize: 1 });
  if (placed.total > 0) return;
  const form = new FormData();
  form.append("is_published", "false");
  await updateEntry(contentId, form);
}

export default function SplashDefaults({ registry }: { registry: SplashRegistry }) {
  const client = useQueryClient();
  const defaults = useQuery({ queryKey: ["content", "splash", "defaults"], queryFn: listSplashDefaults, retry: false });
  const [editing, setEditing] = useState<Editing | null>(null);

  const rows = useMemo(() => registry.pages.flatMap((page) => page.slots.map((slot) => {
    const configured = (defaults.data || []).filter((d) => d.page_key === page.key && d.slot_key === slot.key);
    return { page, slot, configured };
  })), [registry.pages, defaults.data]);

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-4 text-sm text-slate-700">
        <p className="font-semibold text-slate-900">How a page decides what to show</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>A live scheduled campaign for that page and position is shown.</li>
          <li>Otherwise its default content is shown (a device-specific default first, then the Android & iOS one).</li>
          <li>If there is no valid default, or the default is set to Skip, nothing is shown.</li>
        </ol>
        <p className="mt-2 text-xs text-slate-500">Default content must be an image, already live and without an end date.</p>
      </div>

      {defaults.isError ? (
        <div className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">{splashError(defaults.error, "Could not load defaults")} <button type="button" className="ml-2 font-semibold underline" onClick={() => void defaults.refetch()}>Retry</button></div>
      ) : defaults.isPending ? <p className="text-sm text-slate-500">Loading defaults…</p> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500"><tr><th className="px-4 py-3">Page · position</th><th className="px-4 py-3">Defaults</th><th className="px-4 py-3" /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ page, slot, configured }) => (
                <tr key={`${page.key}-${slot.key}`}>
                  <td className="px-4 py-3"><p className="font-semibold text-slate-900">{page.label}</p><p className="text-xs text-slate-500">{slot.label}</p></td>
                  <td className="px-4 py-3">
                    {configured.length === 0 ? <span className="text-xs text-slate-500">Not set: nothing is shown without a campaign</span> : (
                      <ul className="space-y-1">
                        {configured.map((d) => (
                          <li key={d.id} className="text-xs">
                            <span className="font-semibold text-slate-700">{PLATFORM_LABELS[d.platform]}:</span>{" "}
                            {d.fallback_policy === "skip" ? <span className="text-slate-500">Skip (show nothing)</span>
                              : d.content ? <span className={d.content.published && !d.content.expires_at ? "text-emerald-700" : "text-amber-700"}>{d.content.title}{!d.content.published ? " · unpublished, not shown" : d.content.expires_at ? " · has an end date" : ""}</span>
                              : <span className="text-amber-700">Content removed, nothing is shown</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => setEditing({ page_key: page.key, slot_key: slot.key, platform: "all", current: configured.find((d) => d.platform === "all") || null })}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-purple-300"><FiEdit2 /> Configure</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <DefaultForm registry={registry} editing={editing} defaults={defaults.data || []}
          onPlatform={(platform) => setEditing({ ...editing, platform, current: (defaults.data || []).find((d) => d.page_key === editing.page_key && d.slot_key === editing.slot_key && d.platform === platform) || null })}
          onClose={() => setEditing(null)}
          onSaved={() => { void client.invalidateQueries({ queryKey: ["content", "splash"] }); setEditing(null); }} />
      )}
    </section>
  );
}

function DefaultForm({ registry, editing, defaults, onPlatform, onClose, onSaved }: {
  registry: SplashRegistry; editing: Editing; defaults: SplashDefault[];
  onPlatform: (platform: SplashPlatform) => void; onClose: () => void; onSaved: () => void;
}) {
  const page = registry.pages.find((p) => p.key === editing.page_key)!;
  const slot = page.slots.find((s) => s.key === editing.slot_key)!;
  const current = editing.current;
  const [policy, setPolicy] = useState<SplashFallbackPolicy>(current?.fallback_policy || "skip");
  const [choice, setChoice] = useState<ContentChoice>(current?.default_content_id ? "keep" : "upload");
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState(`${page.label} default`);
  const [existing, setExisting] = useState<ApiContentEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    let createdId: number | null = null;
    const base = { page_key: editing.page_key, slot_key: editing.slot_key, platform: editing.platform };
    try {
      let contentId: number | null = current?.default_content_id ?? null;
      let publish = false;
      if (policy === "show_content" && choice !== "keep") {
        if (choice === "upload") {
          if (!file || !title.trim()) throw new Error("Choose an image and a title.");
          const draft = { ...fromApiEntry({
            content_id: 0, module: "mobile_dashboard", zone: "promotional_banner", content_type: "image", display_mode: "single", color_value: null, text_color: null,
            image_url: null, title: title.trim(), cta_text: null, redirect_link: null, target_type: null, target_id: null, start_at: null, end_at: null,
            priority: 0, is_default: 0, is_published: 0, created_by_name: null, created_at: "", updated_at: "", status: "draft",
          }), startAt: nowIstInput(), imageFiles: [file] };
          const created = await createEntry(buildEntryFormData(draft, { isPublished: false, module: "mobile_dashboard" }));
          if (!created.success) throw new Error(created.message || "The default content could not be saved");
          createdId = created.data.content_id;
        } else {
          if (!existing) throw new Error("Choose the CMS content to use.");
          // A copy, so the original keeps working in its own CMS zone. Defaults never end.
          createdId = (await duplicateEntry(existing.content_id)).content_id;
          const form = new FormData();
          form.append("start_at", nowIstInput());
          form.append("end_at", "");
          await updateEntry(createdId, form);
        }
        contentId = createdId;
        publish = true;
      }
      if (policy === "show_content" && !contentId) throw new Error("Choose the default content.");
      await saveSplashDefault({ ...base, fallback_policy: policy, default_content_id: policy === "skip" ? null : contentId, ...(publish ? { publish_content: true } : {}) });
      createdId = null;
      const previous = current?.default_content_id;
      if (previous && previous !== (policy === "skip" ? null : contentId)) {
        await retireIfUnused(previous, defaults, current).catch(() => toast.warning("The previous default content is still published in the CMS."));
      }
      toast.success(policy === "skip" ? "Set to show nothing without a campaign" : "Default content saved");
      onSaved();
    } catch (err) {
      if (createdId) await deleteEntry(createdId).catch(() => undefined);
      setError(splashError(err, "The default could not be saved"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="Configure default">
      <div className="w-full max-w-xl space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-slate-900">Default for {page.label} · {slot.label}</h2>
        <label className="block text-xs font-semibold text-slate-600">Device
          <select className={field} value={editing.platform} onChange={(e) => onPlatform(e.target.value as SplashPlatform)}>
            {registry.platforms.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
          </select></label>
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold text-slate-600">When no campaign is live</legend>
          <label className="flex items-center gap-2 text-sm"><input type="radio" checked={policy === "show_content"} onChange={() => setPolicy("show_content")} /> Show default content</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" checked={policy === "skip"} onChange={() => setPolicy("skip")} /> Skip (show nothing)</label>
        </fieldset>
        {policy === "show_content" && (
          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            {current?.default_content_id && <label className="flex items-center gap-2 text-sm"><input type="radio" checked={choice === "keep"} onChange={() => setChoice("keep")} /> Keep “{current.content?.title || `#${current.default_content_id}`}”</label>}
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={choice === "upload"} onChange={() => setChoice("upload")} /> Upload new artwork</label>
            {choice === "upload" && (
              <div className="space-y-2 pl-6">
                <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Default title" />
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[#852BAF]"><FiUpload /> {file ? file.name : "Choose image (JPG, PNG or WebP)"}
                  <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm"><input type="radio" checked={choice === "existing"} onChange={() => setChoice("existing")} /> Use existing CMS content</label>
            {choice === "existing" && <ExistingPicker selected={existing} onSelect={setExisting} />}
          </div>
        )}
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={busy} className="rounded-xl bg-[#852BAF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Save default"}</button>
        </div>
      </div>
    </div>
  );
}

function ExistingPicker({ selected, onSelect }: { selected: ApiContentEntry | null; onSelect: (entry: ApiContentEntry) => void }) {
  const query = useQuery({
    queryKey: ["content", "splash", "default-candidates"],
    queryFn: () => listEntries({ module: "mobile_dashboard", pageSize: 30, sortBy: "created_at", sortDir: "DESC" }),
    retry: false,
  });
  const image = (entry: ApiContentEntry) => entry.images?.find((i) => i.is_active)?.image_url || entry.image_url;
  const rows = (query.data?.entries || []).filter((entry) => entry.content_type === "image" && image(entry));
  if (query.isError) return <p className="pl-6 text-sm text-rose-600">{splashError(query.error)} <button type="button" onClick={() => void query.refetch()} className="underline"><FiRefreshCw className="inline" /> Retry</button></p>;
  if (query.isPending) return <p className="pl-6 text-sm text-slate-500">Loading…</p>;
  if (!rows.length) return <p className="pl-6 text-sm text-slate-500">No Mobile Dashboard image content.</p>;
  return (
    <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto pl-6">
      {rows.map((row) => (
        <button key={row.content_id} type="button" onClick={() => onSelect(row)} className={`overflow-hidden rounded-lg border text-left ${selected?.content_id === row.content_id ? "border-[#852BAF] ring-2 ring-purple-200" : "border-slate-200"}`}>
          {image(row) ? <img src={image(row)!} alt="" className="aspect-[2/1] w-full object-cover" /> : <span className="flex aspect-[2/1] items-center justify-center bg-slate-100"><FiImage /></span>}
          <span className="block truncate px-2 py-1 text-[11px] font-semibold">{row.title}</span>
        </button>
      ))}
    </div>
  );
}
