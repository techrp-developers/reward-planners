import { FiAlertTriangle, FiEye, FiSave } from "react-icons/fi";
import type { ContentEntry, ContentKind, ContentZoneImage, Zone } from "../types";
import { COLOR_PRESETS, ZONES } from "../types";
import { computeStatus, findConflicts } from "../store";
import StatusBadge from "./StatusBadge";
import OfferImagesManager from "./OfferImagesManager";
import ImageDimensionInfo from "./ImageDimensionInfo";
import AssetSpecPanel from "./AssetSpecPanel";

const inputClass = "mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100";
const labelClass = "text-xs font-bold text-slate-500";

interface Props {
  draft: ContentEntry;
  entries: ContentEntry[];
  now: Date;
  onChange: (patch: Partial<ContentEntry>) => void;
  onSaveDraft: () => void;
  onPreview: () => void;
  onPublish: () => void;
  saving: boolean;
}

export default function ContentForm({ draft, entries, now, onChange, onSaveDraft, onPreview, onPublish, saving }: Props) {
  const status = computeStatus(draft, now);
  const conflicts = findConflicts(draft, entries);

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => onChange({ imageFile: file, imageUrl: String(reader.result || "") });
    reader.readAsDataURL(file);
  };

  return (
    <div className="rounded-3xl border border-purple-100 bg-white p-6 shadow-[0_18px_55px_rgba(67,31,91,0.08)]">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-black text-slate-900">{draft.isDefault ? "Edit Default Content" : draft.id ? "Edit Content" : "Add Content"}</h2>
        <StatusBadge status={status} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Zone
          <select
            value={draft.zone}
            disabled={draft.isDefault}
            onChange={(event) => onChange({ zone: event.target.value as Zone })}
            className={`${inputClass} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400`}
          >
            {ZONES.map((zone) => <option key={zone.key} value={zone.key}>{zone.label}</option>)}
          </select>
        </label>

        <label className={labelClass}>
          Content Type
          <select value={draft.contentType} onChange={(event) => onChange({ contentType: event.target.value as ContentKind })} className={inputClass}>
            <option value="color">Color</option>
            <option value="image">Image</option>
          </select>
        </label>

        {draft.contentType === "color" ? (
          <div className="sm:col-span-2">
            <p className={labelClass}>Color</p>
            <div className="mt-2 flex items-center gap-3">
              <input type="color" value={draft.colorValue} onChange={(event) => onChange({ colorValue: event.target.value })} className="h-11 w-14 cursor-pointer rounded-lg border border-slate-200" />
              <input value={draft.colorValue} onChange={(event) => onChange({ colorValue: event.target.value })} placeholder="#852BAF" className={`${inputClass} mt-0 flex-1`} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => onChange({ colorValue: color })}
                  className={`h-8 w-8 rounded-lg border-2 transition ${draft.colorValue === color ? "border-[#852BAF] scale-110" : "border-white shadow"}`}
                  style={{ background: color }}
                  aria-label={color}
                />
              ))}
            </div>
          </div>
        ) : draft.zone === "offers_banner" ? (
          draft.id ? (
            <OfferImagesManager
              contentId={draft.id}
              images={draft.images ?? []}
              onChange={(images: ContentZoneImage[]) => onChange({ images })}
            />
          ) : (
            <div className="sm:col-span-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500">
              Save this campaign as a draft first, then come back to add one or more offer images.
            </div>
          )
        ) : (
          <div className="sm:col-span-2">
            <p className={labelClass}>Image</p>
            <ImageDimensionInfo
              zone={draft.zone}
              imageUrl={draft.imageUrl}
              file={draft.imageFile}
              onSelectFile={handleImageUpload}
            />
          </div>
        )}

        {draft.contentType === "image" && (
          <div className="sm:col-span-2">
            <AssetSpecPanel />
          </div>
        )}

        <label className={`${labelClass} sm:col-span-2`}>
          Title / Label
          <input value={draft.title} onChange={(event) => onChange({ title: event.target.value })} placeholder="e.g. Raksha Bandhan Sale" className={inputClass} />
        </label>

        <label className={labelClass}>
          CTA Text <span className="font-normal text-slate-400">(optional)</span>
          <input value={draft.ctaText} onChange={(event) => onChange({ ctaText: event.target.value })} placeholder="e.g. Shop Now" className={inputClass} />
        </label>

        <label className={labelClass}>
          Redirect Link <span className="font-normal text-slate-400">(optional)</span>
          <input value={draft.redirectLink} onChange={(event) => onChange({ redirectLink: event.target.value })} placeholder="https://..." className={inputClass} />
        </label>

        <label className={labelClass}>
          Start Date &amp; Time
          <input type="datetime-local" value={draft.startAt} onChange={(event) => onChange({ startAt: event.target.value })} className={inputClass} />
        </label>

        <label className={labelClass}>
          End Date &amp; Time
          <input type="datetime-local" value={draft.endAt} min={draft.startAt || undefined} onChange={(event) => onChange({ endAt: event.target.value })} className={inputClass} />
        </label>

        <label className={labelClass}>
          Priority <span className="font-normal text-slate-400">(optional)</span>
          <input type="number" min={0} value={draft.priority} onChange={(event) => onChange({ priority: Number(event.target.value) || 0 })} className={inputClass} />
        </label>
      </div>

      {conflicts.length > 0 && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
          <FiAlertTriangle className="mt-0.5 shrink-0" />
          <span>
            Overlaps with {conflicts.length} other {conflicts.length === 1 ? "entry" : "entries"} in this zone/time window
            ({conflicts.map((c) => c.title).join(", ")}). The entry with the higher priority will win.
          </span>
        </div>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5">
        <button type="button" onClick={onPreview} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <FiEye /> Preview
        </button>
        <button type="button" onClick={onSaveDraft} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-5 py-3 text-sm font-bold text-[#852BAF] hover:bg-purple-100 disabled:opacity-50">
          <FiSave /> Save as Draft
        </button>
        <button type="button" onClick={onPublish} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-5 py-3 text-sm font-extrabold text-white shadow disabled:opacity-50">
          Publish
        </button>
      </div>
    </div>
  );
}
