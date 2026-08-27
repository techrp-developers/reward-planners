import { useState } from "react";
import type { ContentEntry, Zone } from "../types";
import type { ResolvedModuleIcon } from "../api/ModuleIconApi";
import { resolveZoneEntry } from "../store";
import PhoneFrame from "./PhoneFrame";
import MobileHomePreview from "./MobileHomePreview";

interface Props {
  entries: ContentEntry[];
  draft: ContentEntry;
  now: Date;
  /** From GET /content/resolved/modules - fetched once at the Content Management level, not per-preview. */
  moduleIcons?: ResolvedModuleIcon[];
}

type PreviewMode = "default" | "campaign";

const DEVICE_WIDTHS = [360, 390, 430] as const;

export default function LivePreviewPanel({ entries, draft, now, moduleIcons = [] }: Props) {
  const [mode, setMode] = useState<PreviewMode>("campaign");
  const [previewModule, setPreviewModule] = useState("product");
  const [deviceWidth, setDeviceWidth] = useState<(typeof DEVICE_WIDTHS)[number]>(390);

  const resolve = (zone: Zone): ContentEntry | undefined => {
    if (zone === draft.zone) {
      if (mode === "default") return entries.find((entry) => entry.zone === zone && entry.isDefault);
      return draft;
    }
    return resolveZoneEntry(zone, entries, now);
  };

  const navbar = resolve("navbar_background");
  const promo = resolve("promotional_banner");
  const offers = resolve("offers_banner");

  return (
    <div className="sticky top-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-slate-900">Live Mobile Preview</h3>
          <span className="text-[11px] font-semibold text-slate-400">Reward Planner Home</span>
        </div>

        {!draft.isDefault && (
          <div className="flex w-fit gap-1 rounded-xl border border-purple-100 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setMode("default")}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${mode === "default" ? "bg-[#852BAF] text-white shadow" : "text-slate-500 hover:bg-purple-50"}`}
            >
              Default
            </button>
            <button
              type="button"
              onClick={() => setMode("campaign")}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${mode === "campaign" ? "bg-[#852BAF] text-white shadow" : "text-slate-500 hover:bg-purple-50"}`}
            >
              This Campaign
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-1.5">
        <span className="text-[11px] font-semibold text-slate-400">Preview width:</span>
        {DEVICE_WIDTHS.map((width) => (
          <button
            key={width}
            type="button"
            onClick={() => setDeviceWidth(width)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${deviceWidth === width ? "bg-[#852BAF] text-white shadow" : "bg-white text-slate-500 border border-slate-200 hover:bg-purple-50"}`}
          >
            {width}
          </button>
        ))}
      </div>

      <PhoneFrame width={deviceWidth}>
        <MobileHomePreview resolve={resolve} moduleIcons={moduleIcons} previewModule={previewModule} onSelectModule={setPreviewModule} />
      </PhoneFrame>

      <div className="space-y-1.5 rounded-2xl border border-slate-100 bg-white p-3">
        {([["Navbar", navbar], ["Promo Banner", promo], ["Offers Banner", offers]] as const).map(([label, entry]) => (
          <div key={label} className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-slate-500">{label}</span>
            <span className="font-semibold text-slate-700">{entry?.isDefault ? "Default" : entry?.title || "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
