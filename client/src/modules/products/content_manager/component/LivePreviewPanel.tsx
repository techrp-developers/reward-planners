import { useState, type CSSProperties } from "react";
import type { ContentEntry, Zone } from "../types";
import { resolveZoneEntry } from "../store";
import PhoneFrame from "./PhoneFrame";

interface Props {
  entries: ContentEntry[];
  draft: ContentEntry;
  now: Date;
}

type PreviewMode = "default" | "campaign";

const OFFER_CARD_LABELS = ["Top Pick", "Combo Deal", "New Arrival"];

const zoneStyle = (entry?: ContentEntry): CSSProperties => {
  if (!entry) return { background: "#e5e7eb" };
  if (entry.contentType === "image" && entry.imageUrl) {
    return { background: `url(${entry.imageUrl}) center/cover no-repeat` };
  }
  return { background: entry.colorValue || "#e5e7eb" };
};

const textShadow = "[text-shadow:0_1px_4px_rgba(0,0,0,0.45)]";

export default function LivePreviewPanel({ entries, draft, now }: Props) {
  const [mode, setMode] = useState<PreviewMode>("campaign");

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
        <h3 className="text-sm font-black text-slate-900">Live Preview</h3>
        <span className="text-[11px] font-semibold text-slate-400">Home screen</span>
      </div>

      {!draft.isDefault && (
        <div className="mx-auto flex w-fit gap-1 rounded-xl border border-purple-100 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setMode("default")}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${mode === "default" ? "bg-[#852BAF] text-white shadow" : "text-slate-500 hover:bg-purple-50"}`}
          >
            Preview: Default
          </button>
          <button
            type="button"
            onClick={() => setMode("campaign")}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${mode === "campaign" ? "bg-[#852BAF] text-white shadow" : "text-slate-500 hover:bg-purple-50"}`}
          >
            Preview: This Campaign
          </button>
        </div>
      )}

      <PhoneFrame>
        <div className={`flex items-center justify-between px-4 py-4 text-white ${textShadow}`} style={zoneStyle(navbar)}>
          <span className="text-sm font-black">RP</span>
          <div className="flex items-center gap-2 text-[10px] font-bold">
            <span className="rounded-full bg-white/25 px-2.5 py-1">Product</span>
            <span className="opacity-70">Service</span>
            <span className="opacity-70">Payment</span>
          </div>
        </div>

        <div className="space-y-5 p-3">
          <div className={`flex min-h-[110px] flex-col justify-center gap-1.5 rounded-2xl px-4 py-4 text-white ${textShadow}`} style={zoneStyle(promo)}>
            <p className="text-lg font-black leading-tight">{promo?.title || "Promotional Banner"}</p>
            {promo?.ctaText && (
              <span className="mt-1 inline-flex w-fit items-center rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-900">
                {promo.ctaText}
              </span>
            )}
          </div>

          <div>
            <p className="mb-2 px-1 text-xs font-black text-slate-800">{offers?.title || "Offers Banner"}</p>
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {OFFER_CARD_LABELS.map((label) => (
                <div
                  key={label}
                  className={`flex h-24 w-24 shrink-0 flex-col justify-end rounded-xl px-2 py-2 text-white ${textShadow}`}
                  style={zoneStyle(offers)}
                >
                  <span className="text-[10px] font-bold leading-tight">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
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
