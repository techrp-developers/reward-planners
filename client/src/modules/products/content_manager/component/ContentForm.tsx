import { FiAlertTriangle, FiEye, FiSave } from "react-icons/fi";
import type { ContentDisplayMode, ContentEntry, ContentKind, ContentZoneImage, GradientConfig, GradientDirection, Zone } from "../types";
import { COLOR_PRESETS, DISPLAY_MODES, GRADIENT_PRESETS, ZONES } from "../types";
import type { ContentModule } from "../api/ContentApi";
import { computeStatus, findConflicts } from "../store";
import {
  DEFAULT_GRADIENT_COLORS,
  DEFAULT_GRADIENT_DIRECTION,
  DEFAULT_SOLID_COLOR,
  GRADIENT_DIRECTION_LABELS,
  GRADIENT_DIRECTIONS,
  cmsColorToBackground,
  gradientToCssBackground,
  isValidHexColor,
  makeGradientColorValue,
  parseCmsColorValue,
} from "../utils/cmsColor";
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
  module: ContentModule;
  onChange: (patch: Partial<ContentEntry>) => void;
  onSaveDraft: () => void;
  onPreview: () => void;
  onPublish: () => void;
  saving: boolean;
}

export default function ContentForm({ draft, entries, now, module, onChange, onSaveDraft, onPreview, onPublish, saving }: Props) {
  const showHeaderTextColor = draft.zone === "navbar_background" && module === "mobile_dashboard";
  const showDisplayMode = draft.contentType === "image" && (draft.zone === "promotional_banner" || draft.zone === "offers_banner");
  const headerTextColor = isValidHexColor(draft.textColor) ? draft.textColor : "#FFFFFF";
  const status = computeStatus(draft, now);
  const conflicts = findConflicts(draft, entries);
  const parsedColor = parseCmsColorValue(draft.colorValue);
  const gradient: GradientConfig =
    parsedColor.type === "gradient"
      ? parsedColor
      : { type: "gradient", colors: DEFAULT_GRADIENT_COLORS, direction: DEFAULT_GRADIENT_DIRECTION };
  const solidColor = parsedColor.type === "solid" ? parsedColor.color : DEFAULT_SOLID_COLOR;
  const nativeSolidColor = isValidHexColor(solidColor) ? solidColor : DEFAULT_SOLID_COLOR;

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => onChange({ imageFile: file, imageUrl: String(reader.result || "") });
    reader.readAsDataURL(file);
  };

  const updateGradient = (patch: Partial<GradientConfig>) => {
    const next = { ...gradient, ...patch };
    onChange({ colorValue: makeGradientColorValue(next.colors, next.direction) });
  };

  const updateGradientColor = (index: number, color: string) => {
    updateGradient({ colors: gradient.colors.map((existing, i) => (i === index ? color : existing)) });
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

        {showDisplayMode && (
          <label className={labelClass}>
            Display Mode
            <select
              value={draft.displayMode}
              onChange={(event) => onChange({ displayMode: event.target.value as ContentDisplayMode })}
              className={inputClass}
            >
              {DISPLAY_MODES.map((mode) => <option key={mode.key} value={mode.key}>{mode.label}</option>)}
            </select>
          </label>
        )}

        {draft.contentType === "color" ? (
          <div className="sm:col-span-2 space-y-5 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <div>
              <p className={labelClass}>Color Type</p>
              <div className="mt-2 inline-flex rounded-xl border border-purple-100 bg-white p-1 shadow-sm">
                <button
                  type="button"
                  onClick={() => onChange({ colorValue: solidColor })}
                  className={`rounded-lg px-4 py-2 text-xs font-bold transition ${parsedColor.type === "solid" ? "bg-[#852BAF] text-white shadow" : "text-slate-500 hover:bg-purple-50"}`}
                >
                  Solid Color
                </button>
                <button
                  type="button"
                  onClick={() => onChange({ colorValue: makeGradientColorValue() })}
                  className={`rounded-lg px-4 py-2 text-xs font-bold transition ${parsedColor.type === "gradient" ? "bg-[#852BAF] text-white shadow" : "text-slate-500 hover:bg-purple-50"}`}
                >
                  Gradient
                </button>
              </div>
            </div>

            {parsedColor.type === "solid" ? (
              <div>
                <p className={labelClass}>Color</p>
                <div className="mt-2 flex items-center gap-3">
                  <input type="color" value={nativeSolidColor} onChange={(event) => onChange({ colorValue: event.target.value })} className="h-11 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white" />
                  <input value={draft.colorValue} onChange={(event) => onChange({ colorValue: event.target.value })} placeholder="#852BAF" className={`${inputClass} mt-0 flex-1 bg-white`} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => onChange({ colorValue: color })}
                      className={`h-8 w-8 rounded-lg border-2 transition ${solidColor.toLowerCase() === color.toLowerCase() ? "scale-110 border-[#852BAF]" : "border-white shadow"}`}
                      style={{ background: color }}
                      aria-label={color}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {gradient.colors.map((color, index) => (
                    <label key={index} className={labelClass}>
                      {index === 0 ? "Gradient Start Color" : index === gradient.colors.length - 1 ? "Gradient End Color" : "Gradient Middle Color"}
                      <div className="mt-2 flex items-center gap-3">
                        <input
                          type="color"
                          value={isValidHexColor(color) ? color : DEFAULT_SOLID_COLOR}
                          onChange={(event) => updateGradientColor(index, event.target.value)}
                          className="h-11 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white"
                        />
                        <input
                          value={color}
                          onChange={(event) => updateGradientColor(index, event.target.value)}
                          placeholder={index === 0 ? "#852BAF" : "#FC3F78"}
                          className={`${inputClass} mt-0 flex-1 bg-white`}
                        />
                      </div>
                    </label>
                  ))}
                </div>

                <div className="flex flex-wrap items-end gap-3">
                  {gradient.colors.length < 3 && (
                    <button
                      type="button"
                      onClick={() => updateGradient({ colors: [gradient.colors[0] || DEFAULT_SOLID_COLOR, "#C026D3", gradient.colors[1] || "#FC3F78"] })}
                      className="rounded-xl border border-purple-200 bg-white px-4 py-2.5 text-xs font-bold text-[#852BAF] hover:bg-purple-50"
                    >
                      + Add Color
                    </button>
                  )}
                  {gradient.colors.length > 2 && (
                    <button
                      type="button"
                      onClick={() => updateGradient({ colors: [gradient.colors[0], gradient.colors[gradient.colors.length - 1]] })}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50"
                    >
                      Remove Middle
                    </button>
                  )}
                  <label className={`${labelClass} min-w-[220px] flex-1`}>
                    Direction
                    <select
                      value={gradient.direction}
                      onChange={(event) => updateGradient({ direction: event.target.value as GradientDirection })}
                      className={`${inputClass} bg-white`}
                    >
                      {GRADIENT_DIRECTIONS.map((direction) => (
                        <option key={direction} value={direction}>{GRADIENT_DIRECTION_LABELS[direction]}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div>
                  <p className={labelClass}>Gradient Preview</p>
                  <div className="mt-2 flex min-h-28 items-center justify-center rounded-2xl border border-white shadow-inner" style={{ background: gradientToCssBackground(gradient) }}>
                    <span className="rounded-full bg-black/20 px-4 py-2 text-xs font-black text-white backdrop-blur [text-shadow:0_1px_5px_rgba(0,0,0,0.4)]">
                      {gradient.colors.join(" -> ")}
                    </span>
                  </div>
                </div>

                <div>
                  <p className={labelClass}>Gradient Presets</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {GRADIENT_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => onChange({ colorValue: makeGradientColorValue(preset.colors, gradient.direction) })}
                        className="overflow-hidden rounded-xl border border-white bg-white p-0 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <span className="block h-12" style={cmsColorToBackground(makeGradientColorValue(preset.colors, gradient.direction))} />
                        <span className="block px-3 py-2 text-xs font-black text-slate-700">{preset.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
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

        {showHeaderTextColor && (
          <div className="sm:col-span-2">
            <p className={labelClass}>Header Text Color</p>
            <p className="mt-1 text-[11px] font-medium text-slate-400">
              Controls the greeting name, subtitle and search placeholder color in the mobile dashboard header.
            </p>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="color"
                value={headerTextColor}
                onChange={(event) => onChange({ textColor: event.target.value })}
                className="h-11 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white"
              />
              <input
                value={draft.textColor}
                onChange={(event) => onChange({ textColor: event.target.value })}
                placeholder="#FFFFFF"
                className={`${inputClass} mt-0 flex-1 bg-white`}
              />
            </div>
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
