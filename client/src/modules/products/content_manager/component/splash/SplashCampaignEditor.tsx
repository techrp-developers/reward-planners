import { useEffect, useMemo, useState } from "react";
import { FiAlertTriangle, FiCheck, FiChevronLeft, FiChevronRight, FiImage, FiSearch, FiUpload, FiX } from "react-icons/fi";
import { toast } from "sonner";
import Swal from "sweetalert2";
import {
  addEntryImages, buildEntryFormData, createEntry, deleteEntry, deleteEntryImage, duplicateEntry, getEntry, listEntries, updateEntry,
  type ApiContentEntry, type ContentModule,
} from "../../api/ContentApi";
import {
  createSplashPlacement, deleteSplashPlacement, listSplashPlacements, splashError, updateSplashPlacement,
  type SplashAudience, type SplashFrequency, type SplashPlacement, type SplashPlacementUpdateRequest, type SplashPlatform, type SplashRegistry,
} from "../../api/SplashscreenApi";
import { fromApiEntry } from "../../store/mappers";
import type { ContentEntry, ContentTargetType } from "../../types";
import {
  AUDIENCE_LABELS, FREQUENCY_LABELS, PLATFORM_LABELS, cmsTimeToInput, competingCampaigns, nowIstInput, scheduleError,
} from "../../utils/splash";
import ContentTargetSelector from "../ContentTargetSelector";
import SplashPhonePreview from "./SplashPhonePreview";

type Source = "new" | "existing";
type SaveAction = "draft" | "publish" | "publish_enable";

interface Props {
  registry: SplashRegistry;
  /** Edit this placement; omit to create a campaign. */
  placement?: SplashPlacement | null;
  onClose: () => void;
  onSaved: () => void;
}

const STEPS = ["Campaign", "Page", "Position", "Device & audience", "Schedule", "Display rules", "Review"] as const;
const ARTWORK_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_ARTWORK_BYTES = 5 * 1024 * 1024;
const MIN_ARTWORK = { width: 600, height: 300 };
const field = "w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100 disabled:bg-slate-50";
const label = "mb-1.5 block text-xs font-semibold text-slate-600";
const CONTENT_MODULES: { value: ContentModule; label: string }[] = [
  { value: "mobile_dashboard", label: "Mobile Dashboard" }, { value: "product", label: "Product" },
  { value: "service", label: "Service" }, { value: "payment", label: "Payment" },
  { value: "bus_booking", label: "Bus Booking" },
];

const entryImage = (entry: ApiContentEntry | null) => entry?.images?.find((image) => image.is_active)?.image_url || entry?.image_url || null;

async function readArtwork(file: File): Promise<string | null> {
  if (!ARTWORK_TYPES.includes(file.type)) return "Use a JPG, PNG or WebP image.";
  if (file.size > MAX_ARTWORK_BYTES) return "The image must be 5 MB or smaller.";
  const url = URL.createObjectURL(file);
  try {
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("unreadable"));
      img.src = url;
    });
    if (size.width < MIN_ARTWORK.width || size.height < MIN_ARTWORK.height) {
      return `The image must be at least ${MIN_ARTWORK.width}×${MIN_ARTWORK.height} px (it is ${size.width}×${size.height}).`;
    }
    return null;
  } catch {
    return "The file is not a readable image.";
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function SplashCampaignEditor({ registry, placement = null, onClose, onSaved }: Props) {
  const editing = Boolean(placement);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Campaign content (a CMS entry)
  const [source, setSource] = useState<Source>("new");
  const [entry, setEntry] = useState<ApiContentEntry | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [redirectLink, setRedirectLink] = useState("");
  const [target, setTarget] = useState<{ type: ContentTargetType | ""; id: number | null; ids: number[] }>({ type: "", id: null, ids: [] });
  const [start, setStart] = useState(nowIstInput());
  const [end, setEnd] = useState("");
  const [noExpiry, setNoExpiry] = useState(false);
  const [priority, setPriority] = useState(0);
  const [published, setPublished] = useState(false);

  // Placement
  const [pageKey, setPageKey] = useState(registry.pages[0]?.key || "");
  const [slotKey, setSlotKey] = useState(registry.pages[0]?.slots[0]?.key || "");
  const [platform, setPlatform] = useState<SplashPlatform>("all");
  const [audience, setAudience] = useState<SplashAudience>("all");
  const [frequency, setFrequency] = useState<SplashFrequency>("once_per_day");
  const [seconds, setSeconds] = useState<number>(registry.display_seconds.default);
  const [enabled, setEnabled] = useState(true);
  const [previewDevice, setPreviewDevice] = useState<"android" | "ios">("android");
  const [competitors, setCompetitors] = useState<SplashPlacement[]>([]);

  const page = registry.pages.find((p) => p.key === pageKey) || null;
  const slot = page?.slots.find((s) => s.key === slotKey) || null;
  const isBanner = slot?.kind === "banner";
  const moving = editing && placement && (placement.page_key !== pageKey || placement.slot_key !== slotKey);

  // Edit: the placement and its CMS entry, as saved.
  useEffect(() => {
    if (!placement) return;
    let active = true;
    getEntry(placement.content_id).then((row) => {
      if (!active) return;
      const draft = fromApiEntry(row);
      setEntry(row);
      setSource("existing");
      setTitle(draft.title); setCtaText(draft.ctaText); setRedirectLink(draft.redirectLink);
      setTarget({ type: draft.targetType, id: draft.targetId, ids: draft.targetIds });
      setStart(cmsTimeToInput(row.start_at) || nowIstInput()); setEnd(cmsTimeToInput(row.end_at)); setNoExpiry(!row.end_at);
      setPriority(Number(row.priority) || 0); setPublished(Boolean(Number(row.is_published)));
      setPageKey(placement.page_key); setSlotKey(placement.slot_key);
      setPlatform(placement.platform); setAudience(placement.audience);
      setFrequency(placement.frequency_rule); setSeconds(placement.display_seconds ?? registry.display_seconds.default);
      setEnabled(placement.is_enabled);
    }).catch((error) => active && setLoadError(splashError(error, "Could not load this campaign")))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [placement, registry.display_seconds.default]);

  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);

  // Live and scheduled campaigns already on this page/slot, for overlap and priority warnings.
  useEffect(() => {
    if (!pageKey || !slotKey) return;
    let active = true;
    listSplashPlacements({ page_key: pageKey, slot_key: slotKey, pageSize: 100 })
      .then((result) => active && setCompetitors(result.placements))
      .catch(() => active && setCompetitors([]));
    return () => { active = false; };
  }, [pageKey, slotKey]);

  const previewImage = fileUrl || entryImage(entry);
  const competing = useMemo(() => competingCampaigns({
    id: placement?.id, page_key: pageKey, slot_key: slotKey, platform, audience, start, end: noExpiry ? null : end || null, priority,
  }, competitors.filter((p) => p.content_id !== placement?.content_id)), [competitors, placement, pageKey, slotKey, platform, audience, start, end, noExpiry, priority]);
  const duplicate = competitors.find((p) => p.id !== placement?.id && p.content_id === (entry?.content_id ?? -1) && p.platform === platform && p.audience === audience);

  async function chooseFile(next: File | null) {
    setErrors((current) => ({ ...current, artwork: "" }));
    if (!next) return;
    const problem = await readArtwork(next);
    if (problem) { setErrors((current) => ({ ...current, artwork: problem })); return; }
    if (fileUrl) URL.revokeObjectURL(fileUrl);
    setFile(next);
    setFileUrl(URL.createObjectURL(next));
  }

  function chooseExisting(row: ApiContentEntry) {
    const draft = fromApiEntry(row);
    setEntry(row);
    setTitle(draft.title); setCtaText(draft.ctaText); setRedirectLink(draft.redirectLink);
    setTarget({ type: draft.targetType, id: draft.targetId, ids: draft.targetIds });
    setPriority(Number(row.priority) || 0);
    setErrors((current) => ({ ...current, artwork: "" }));
  }

  function validate(upTo: number): boolean {
    const next: Record<string, string> = {};
    if (upTo >= 0) {
      if (!title.trim()) next.title = "Give the campaign a title.";
      if (!editing && source === "new" && !file) next.artwork = "Upload the campaign image.";
      if (!editing && source === "existing" && !entry) next.artwork = "Choose the CMS content to use.";
      if (redirectLink && !/^https:\/\//i.test(redirectLink.trim())) next.redirectLink = "Links must start with https://";
      if (!Number.isInteger(priority)) next.priority = "Priority must be a whole number.";
    }
    if (upTo >= 1 && !page) next.page = "Choose a page.";
    if (upTo >= 2 && !slot) next.slot = "Choose a position available on this page.";
    if (upTo >= 4) { const problem = scheduleError(start, end, noExpiry); if (problem) next.schedule = problem; }
    if (upTo >= 5 && !isBanner && (seconds < registry.display_seconds.min || seconds > registry.display_seconds.max || !Number.isInteger(seconds))) {
      next.seconds = `Choose ${registry.display_seconds.min}–${registry.display_seconds.max} seconds.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const go = (to: number) => { if (to <= step || validate(to - 1)) setStep(to); };

  /** The CMS entry form, with the same fields the Content screens send. */
  function entryForm(isPublished: boolean, withImage: boolean): FormData {
    const base: ContentEntry = entry ? fromApiEntry(entry) : fromApiEntry({
      content_id: 0, module: "mobile_dashboard", zone: "promotional_banner", content_type: "image", display_mode: "single",
      color_value: null, text_color: null, image_url: null, title: "", cta_text: null, redirect_link: null, target_type: null, target_id: null,
      start_at: null, end_at: null, priority: 0, is_default: 0, is_published: 0, created_by_name: null, created_at: "", updated_at: "", status: "draft",
    });
    const draft: ContentEntry = {
      ...base, zone: "promotional_banner", contentType: "image", displayMode: "single",
      title: title.trim(), ctaText: ctaText.trim(), redirectLink: redirectLink.trim(),
      targetType: target.type, targetId: target.id, targetIds: target.ids,
      startAt: start, endAt: noExpiry ? "" : end, priority,
      imageFiles: withImage && file ? [file] : [],
    };
    const form = buildEntryFormData(draft, { isPublished, module: (entry?.module as ContentModule) || "mobile_dashboard" });
    // buildEntryFormData leaves out an empty end date; an empty value clears it ("No expiry").
    if (noExpiry) form.set("end_at", "");
    return form;
  }

  async function publishEntry(contentId: number) {
    const form = new FormData();
    form.append("is_published", "true");
    await updateEntry(contentId, form);
  }

  async function create(action: SaveAction) {
    let contentId: number | null = null;
    let createdPlacement = false;
    try {
      if (source === "new") {
        const created = await createEntry(entryForm(false, true));
        if (!created.success) throw new Error(created.message || "The campaign content could not be saved");
        contentId = created.data.content_id;
      } else {
        // Place a copy: the original keeps doing its job in its own CMS zone.
        contentId = (await duplicateEntry(entry!.content_id)).content_id;
        const updated = await updateEntry(contentId, entryForm(false, false));
        if (!updated.success) throw new Error(updated.message || "The campaign content could not be saved");
      }
      await createSplashPlacement({
        content_id: contentId, page_key: pageKey, slot_key: slotKey, platform, audience,
        frequency_rule: isBanner ? "every_visit" : frequency, display_seconds: isBanner ? null : seconds,
        is_enabled: action === "publish_enable" ? true : enabled,
      });
      createdPlacement = true;
    } catch (error) {
      // Nothing half-made is left behind: remove the content created above.
      if (contentId && !createdPlacement) await deleteEntry(contentId).catch(() => undefined);
      toast.error(splashError(error, "The campaign could not be created"));
      return false;
    }
    if (action !== "draft") {
      try {
        await publishEntry(contentId!);
      } catch (error) {
        toast.error(`The campaign was saved as a draft, but publishing failed: ${splashError(error)}`);
        onSaved();
        return false;
      }
    }
    toast.success(action === "draft" ? "Campaign saved as a draft. It is not shown in the app." : "Campaign published");
    return true;
  }

  async function save(action: SaveAction) {
    if (!placement || !entry) return false;
    const publish = action === "draft" ? false : true;
    try {
      const updated = await updateEntry(entry.content_id, entryForm(publish, false));
      if (!updated.success) throw new Error(updated.message || "The campaign content could not be saved");
      if (file) {
        // Replace the artwork: add the new image, then remove the previous ones.
        const previous = (entry.images || []).map((image) => image.image_id).filter((id): id is number => Boolean(id));
        await addEntryImages(entry.content_id, [file]);
        for (const imageId of previous) await deleteEntryImage(entry.content_id, imageId);
      }
      const settings: SplashPlacementUpdateRequest = {
        platform, audience,
        ...(isBanner ? {} : { frequency_rule: frequency, display_seconds: seconds }),
        is_enabled: action === "publish_enable" ? true : enabled,
      };
      if (moving) {
        // Create the replacement first; the old placement goes only once the new one exists.
        const replacement = await createSplashPlacement({
          content_id: entry.content_id, page_key: pageKey, slot_key: slotKey, platform, audience,
          frequency_rule: isBanner ? "every_visit" : frequency, display_seconds: isBanner ? null : seconds, is_enabled: settings.is_enabled ?? true,
        });
        const confirmed = await Swal.fire({
          title: "Remove the old placement?",
          text: `The campaign is now also on ${page?.label} · ${slot?.label}. Remove it from its previous page and position?`,
          icon: "question", showCancelButton: true, confirmButtonText: "Remove old placement", cancelButtonText: "Keep both",
        });
        if (confirmed.isConfirmed) {
          try { await deleteSplashPlacement(placement.id); }
          catch (error) { toast.error(`Moved, but the old placement could not be removed: ${splashError(error)}. Remove it from the list.`); }
        }
        void replacement;
      } else {
        await updateSplashPlacement(placement.id, settings);
      }
    } catch (error) {
      toast.error(splashError(error, "The campaign could not be saved"));
      return false;
    }
    toast.success(publish ? "Campaign saved and published" : "Campaign saved as a draft. It is not shown in the app.");
    return true;
  }

  async function submit(action: SaveAction) {
    if (!validate(5) || busy) return;
    setBusy(true);
    try {
      const ok = editing ? await save(action) : await create(action);
      if (ok) { onSaved(); onClose(); }
    } finally {
      setBusy(false);
    }
  }

  if (loading || loadError) {
    return (
      <Shell onClose={onClose} title={editing ? "Edit campaign" : "Create splash campaign"}>
        <div className="p-10 text-center text-sm text-slate-500">{loadError ? <span className="text-rose-600">{loadError}</span> : "Loading campaign…"}</div>
      </Shell>
    );
  }

  return (
    <Shell onClose={onClose} title={editing ? `Edit campaign · ${title || placement?.content.title}` : "Create splash campaign"}>
      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <ol className="flex flex-wrap gap-2" aria-label="Steps">
            {STEPS.map((name, index) => (
              <li key={name}>
                <button type="button" onClick={() => go(index)} aria-current={index === step ? "step" : undefined}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${index === step ? "bg-[#852BAF] text-white" : index < step ? "bg-purple-50 text-[#852BAF]" : "bg-slate-100 text-slate-500"}`}>
                  {index < step ? <FiCheck className="mr-1 inline" /> : `${index + 1}. `}{name}
                </button>
              </li>
            ))}
          </ol>

          {step === 0 && (
            <section className="space-y-4">
              {!editing && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {([["new", "Create new campaign content", "Upload artwork for this campaign"], ["existing", "Use existing CMS content", "A copy is placed; the original stays where it is"]] as const).map(([value, name, hint]) => (
                    <button key={value} type="button" onClick={() => { setSource(value); setEntry(null); setErrors({}); }}
                      className={`rounded-xl border p-3 text-left ${source === value ? "border-[#852BAF] bg-purple-50" : "border-slate-200 hover:border-purple-300"}`}>
                      <span className="block text-sm font-semibold text-slate-900">{name}</span><span className="text-xs text-slate-500">{hint}</span>
                    </button>
                  ))}
                </div>
              )}
              {source === "new" || editing
                ? <ArtworkField file={file} existingUrl={entryImage(entry)} onFile={chooseFile} error={errors.artwork} replace={editing} />
                : <ExistingContentPicker selected={entry} onSelect={chooseExisting} error={errors.artwork} />}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2"><span className={label}>Campaign title *</span>
                  <input className={field} value={title} maxLength={255} onChange={(e) => setTitle(e.target.value)} aria-invalid={Boolean(errors.title)} />
                  {errors.title && <FieldError text={errors.title} />}</label>
                <label><span className={label}>CTA text</span><input className={field} value={ctaText} maxLength={255} placeholder="Shop now" onChange={(e) => setCtaText(e.target.value)} /></label>
                <label><span className={label}>Priority</span>
                  <input type="number" step={1} className={field} value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
                  <span className="mt-1 block text-[11px] text-slate-500">Higher wins when campaigns overlap.</span>
                  {errors.priority && <FieldError text={errors.priority} />}</label>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-2 text-xs font-semibold text-slate-600">Redirect destination</p>
                <ContentTargetSelector module={["service", "service_category", "service_bundle"].includes(target.type) ? "service" : "product"}
                  targetType={target.type} targetId={target.id} targetIds={target.ids}
                  onChange={(type, id, ids) => setTarget({ type, id, ids: ids || [] })} />
                <label className="mt-3 block"><span className={label}>Or an outside link (optional)</span>
                  <input className={field} value={redirectLink} placeholder="https://rewardplanners.com/…" onChange={(e) => setRedirectLink(e.target.value)} />
                  <span className="mt-1 block text-[11px] text-slate-500">The app opens only HTTPS links on rewardplanners.com.</span>
                  {errors.redirectLink && <FieldError text={errors.redirectLink} />}</label>
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="space-y-3">
              <label className="block"><span className={label}>Mobile page *</span>
                <select className={field} value={pageKey} onChange={(e) => { const next = registry.pages.find((p) => p.key === e.target.value); setPageKey(e.target.value); setSlotKey(next?.slots[0]?.key || ""); }}>
                  {registry.pages.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select></label>
              {errors.page && <FieldError text={errors.page} />}
              {moving && <Notice tone="info">Changing the page or position moves the campaign: a new placement is created first, then you confirm removing the old one.</Notice>}
            </section>
          )}

          {step === 2 && (
            <section className="space-y-3">
              <p className={label}>Display position on {page?.label} *</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {page?.slots.map((s) => (
                  <button key={s.key} type="button" onClick={() => setSlotKey(s.key)}
                    className={`rounded-xl border p-3 text-left ${slotKey === s.key ? "border-[#852BAF] bg-purple-50" : "border-slate-200 hover:border-purple-300"}`}>
                    <span className="block text-sm font-semibold text-slate-900">{s.label}</span>
                    <span className="text-xs text-slate-500">{s.kind === "overlay" ? "Over the page; closes after a few seconds or when dismissed" : "Part of the page; always shown"}</span>
                  </button>
                ))}
              </div>
              {errors.slot && <FieldError text={errors.slot} />}
            </section>
          )}

          {step === 3 && (
            <section className="grid gap-4 sm:grid-cols-2">
              <label><span className={label}>Platform</span>
                <select className={field} value={platform} onChange={(e) => setPlatform(e.target.value as SplashPlatform)}>
                  {registry.platforms.map((p) => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
                </select></label>
              <label><span className={label}>Audience</span>
                <select className={field} value={audience} onChange={(e) => setAudience(e.target.value as SplashAudience)}>
                  {registry.audiences.map((a) => <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>)}
                </select></label>
              <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Placement enabled
              </label>
            </section>
          )}

          {step === 4 && (
            <section className="space-y-4">
              <p className="text-xs text-slate-500">Times are India Standard Time (IST).</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className={label}>Starts (IST) *</span><input type="datetime-local" className={field} value={start} onChange={(e) => setStart(e.target.value)} /></label>
                <label><span className={label}>Ends (IST)</span><input type="datetime-local" className={field} value={noExpiry ? "" : end} min={start || undefined} disabled={noExpiry} onChange={(e) => setEnd(e.target.value)} /></label>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={noExpiry} onChange={(e) => setNoExpiry(e.target.checked)} /> No expiry</label>
              <label className="block max-w-xs"><span className={label}>Priority</span><input type="number" step={1} className={field} value={priority} onChange={(e) => setPriority(Number(e.target.value))} /></label>
              {errors.schedule && <FieldError text={errors.schedule} />}
            </section>
          )}

          {step === 5 && (
            <section className="space-y-4">
              {isBanner ? (
                <Notice tone="info">{slot?.label} is part of the page: it is shown on every visit and never times out.</Notice>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label><span className={label}>Frequency</span>
                    <select className={field} value={frequency} onChange={(e) => setFrequency(e.target.value as SplashFrequency)}>
                      {registry.frequency_rules.map((f) => <option key={f} value={f}>{FREQUENCY_LABELS[f]}</option>)}
                    </select></label>
                  <label><span className={label}>Display duration (seconds)</span>
                    <input type="number" min={registry.display_seconds.min} max={registry.display_seconds.max} step={1} className={field} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
                    <span className="mt-1 block text-[11px] text-slate-500">{registry.display_seconds.min}–{registry.display_seconds.max} seconds, default {registry.display_seconds.default}.</span>
                    {errors.seconds && <FieldError text={errors.seconds} />}</label>
                </div>
              )}
            </section>
          )}

          {step === 6 && (
            <section className="space-y-4">
              <dl className="grid gap-3 rounded-xl border border-slate-200 p-4 text-sm sm:grid-cols-2">
                <Review label="Campaign" value={title} />
                <Review label="Content" value={editing ? `CMS entry #${entry?.content_id}` : source === "new" ? "New artwork" : `Copy of “${entry?.title}”`} />
                <Review label="Page · position" value={`${page?.label} · ${slot?.label}`} />
                <Review label="Platform · audience" value={`${PLATFORM_LABELS[platform]} · ${AUDIENCE_LABELS[audience]}`} />
                <Review label="Starts" value={`${start.replace("T", " ")} IST`} />
                <Review label="Ends" value={noExpiry ? "No expiry" : `${end.replace("T", " ")} IST`} />
                <Review label="Priority" value={String(priority)} />
                <Review label="Display" value={isBanner ? "Every visit, no timeout" : `${FREQUENCY_LABELS[frequency]}, ${seconds}s`} />
                <Review label="Currently" value={editing ? `${published ? "Published" : "Draft"}, placement ${enabled ? "enabled" : "disabled"}` : "Not saved yet"} />
              </dl>
              <Warnings competing={competing} duplicate={Boolean(duplicate)} />
              <p className="text-xs text-slate-500">A draft is never shown in the app. Publishing makes it live from its start time on enabled placements.</p>
            </section>
          )}

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-40"><FiChevronLeft /> Back</button>
            {step < STEPS.length - 1
              ? <button type="button" onClick={() => go(step + 1)} className="inline-flex items-center gap-1 rounded-xl bg-[#852BAF] px-4 py-2 text-sm font-semibold text-white">Next <FiChevronRight /></button>
              : <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
                  <button type="button" onClick={() => void submit("draft")} disabled={busy} className="rounded-xl border border-purple-200 px-4 py-2 text-sm font-semibold text-[#852BAF]">Save draft</button>
                  <button type="button" onClick={() => void submit("publish")} disabled={busy} className="rounded-xl border border-[#852BAF] px-4 py-2 text-sm font-semibold text-[#852BAF]">Publish</button>
                  <button type="button" onClick={() => void submit("publish_enable")} disabled={busy} className="rounded-xl bg-[#852BAF] px-4 py-2 text-sm font-semibold text-white">{busy ? "Saving…" : "Publish & enable"}</button>
                </div>}
          </footer>
        </div>

        <aside className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-600">Local preview <span className="font-normal text-slate-400">· unsaved, not live</span></p>
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs">
              {(["android", "ios"] as const).map((d) => <button key={d} type="button" onClick={() => setPreviewDevice(d)} className={`rounded-md px-2 py-1 font-semibold ${previewDevice === d ? "bg-white text-[#852BAF] shadow-sm" : "text-slate-500"}`}>{d === "ios" ? "iOS" : "Android"}</button>)}
            </div>
          </div>
          {slot && <SplashPhonePreview imageUrl={previewImage} title={title} ctaText={ctaText} slotKey={slot.key} slotKind={slot.kind} device={previewDevice} displaySeconds={isBanner ? null : seconds} pageLabel={page?.label} />}
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-6xl rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><FiX /></button>
        </header>
        {children}
      </div>
    </div>
  );
}

function ArtworkField({ file, existingUrl, onFile, error, replace }: { file: File | null; existingUrl: string | null; onFile: (file: File | null) => void; error?: string; replace: boolean }) {
  return (
    <div>
      <span className={label}>{replace ? "Campaign image" : "Upload campaign image *"}</span>
      <label className="flex cursor-pointer items-center gap-4 rounded-xl border border-dashed border-purple-200 bg-purple-50/40 p-4 hover:border-purple-400">
        {existingUrl && !file ? <img src={existingUrl} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-white text-purple-400"><FiUpload size={22} /></span>}
        <span className="text-sm">
          <span className="block font-semibold text-slate-800">{file ? file.name : replace ? "Replace the image" : "Choose an image"}</span>
          <span className="text-xs text-slate-500">JPG, PNG or WebP, at least 600×300, up to 5 MB. Recommended 1080×1920 for splash and popups.</span>
        </span>
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => onFile(e.target.files?.[0] || null)} />
      </label>
      {error && <FieldError text={error} />}
    </div>
  );
}

function ExistingContentPicker({ selected, onSelect, error }: { selected: ApiContentEntry | null; onSelect: (entry: ApiContentEntry) => void; error?: string }) {
  const [module, setModule] = useState<ContentModule>("mobile_dashboard");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ApiContentEntry[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      setRows(null); setFailed(null);
      listEntries({ module, search: search.trim() || undefined, pageSize: 24, sortBy: "created_at", sortDir: "DESC" })
        .then((result) => active && setRows(result.entries.filter((entry) => entry.content_type === "image" && entryImage(entry))))
        .catch((err) => active && setFailed(splashError(err, "Could not load CMS content")));
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [module, search]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select className={`${field} w-auto`} value={module} onChange={(e) => setModule(e.target.value as ContentModule)} aria-label="CMS module">
          {CONTENT_MODULES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <div className="relative min-w-[200px] flex-1"><FiSearch className="absolute left-3 top-3 text-slate-400" /><input className={`${field} pl-9`} placeholder="Search CMS content" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      </div>
      {failed ? <p className="text-sm text-rose-600">{failed}</p> : !rows ? <p className="text-sm text-slate-500">Loading…</p> : rows.length === 0 ? <p className="text-sm text-slate-500">No image content found.</p> : (
        <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-3">
          {rows.map((row) => (
            <button key={row.content_id} type="button" onClick={() => onSelect(row)}
              className={`overflow-hidden rounded-xl border text-left ${selected?.content_id === row.content_id ? "border-[#852BAF] ring-2 ring-purple-200" : "border-slate-200 hover:border-purple-300"}`}>
              {entryImage(row) ? <img src={entryImage(row)!} alt="" className="aspect-[2/1] w-full object-cover" /> : <span className="flex aspect-[2/1] items-center justify-center bg-slate-100"><FiImage /></span>}
              <span className="block truncate px-2 py-1.5 text-xs font-semibold text-slate-800">{row.title}</span>
            </button>
          ))}
        </div>
      )}
      {error && <FieldError text={error} />}
    </div>
  );
}

function Warnings({ competing, duplicate }: { competing: ReturnType<typeof competingCampaigns>; duplicate: boolean }) {
  if (!competing.length && !duplicate) return null;
  return (
    <div className="space-y-2">
      {duplicate && <Notice tone="warn">This content is already placed here for the same platform and audience; saving will be refused.</Notice>}
      {competing.map(({ placement, outranks, tie }) => (
        <Notice key={placement.id} tone="warn">
          Overlaps “{placement.content.title}” (priority {placement.content.priority}).{" "}
          {outranks ? "That campaign has a higher priority and will be shown instead while both are live." : tie ? "Same priority: the more specific placement, then the later start, wins." : "This campaign has the higher priority and will be shown."}
        </Notice>
      ))}
    </div>
  );
}

const FieldError = ({ text }: { text: string }) => <p className="mt-1 text-xs font-medium text-rose-600" role="alert">{text}</p>;
const Review = ({ label: name, value }: { label: string; value: string }) => <div><dt className="text-xs text-slate-500">{name}</dt><dd className="font-medium text-slate-900">{value}</dd></div>;
const Notice = ({ tone, children }: { tone: "info" | "warn"; children: React.ReactNode }) => (
  <p className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${tone === "warn" ? "bg-amber-50 text-amber-800" : "bg-sky-50 text-sky-800"}`}>
    {tone === "warn" && <FiAlertTriangle className="mt-0.5 shrink-0" />}{children}
  </p>
);
