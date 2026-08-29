import type { CSSProperties } from "react";
import { FiBell, FiGift, FiGrid, FiMapPin, FiSearch, FiUser } from "react-icons/fi";
import type { ContentEntry } from "../types";
import type { ResolvedModuleIcon } from "../api/ModuleIconApi";
import { cmsColorToBackground } from "../utils/cmsColor";

interface Props {
  entry?: ContentEntry;
  moduleIcons: ResolvedModuleIcon[];
  previewModule: string;
  onSelectModule: (moduleKey: string) => void;
}

const backgroundStyle = (entry?: ContentEntry): CSSProperties => {
  if (entry?.contentType === "image" && entry.imageUrl) {
    // Navbar background is intentionally cover-cropped, unlike promo/offer artwork -
    // it's chrome behind other UI, not a standalone creative that must stay whole.
    return { backgroundImage: `url(${entry.imageUrl})`, backgroundSize: "cover", backgroundPosition: "center" };
  }
  return entry?.colorValue ? cmsColorToBackground(entry.colorValue) : { background: "linear-gradient(135deg, #2b0f47, #4a1a63)" };
};

function ModuleIconTile({ module, isSelected, onSelect }: { module: ResolvedModuleIcon; isSelected: boolean; onSelect: () => void }) {
  const iconSrc = isSelected ? module.active_icon_url || module.icon_url : module.icon_url;

  const gradient =
    module.gradient_start_color && module.gradient_end_color
      ? `linear-gradient(135deg, ${module.gradient_start_color}, ${module.gradient_end_color})`
      : null;

  const badgeStyle: CSSProperties = isSelected
    ? { background: gradient || module.active_color || "#FFFFFF" }
    : { background: module.normal_color || "rgba(255,255,255,0.14)" };

  return (
    <button type="button" onClick={onSelect} className="flex shrink-0 flex-col items-center gap-1">
      <span
        className={`grid place-items-center overflow-hidden rounded-2xl transition ${isSelected ? "h-11 w-11 shadow-lg" : "h-9 w-9 opacity-80"}`}
        style={badgeStyle}
      >
        {iconSrc ? (
          <img src={iconSrc} alt="" className={isSelected ? "h-6 w-6 object-contain" : "h-5 w-5 object-contain"} />
        ) : (
          <FiGrid size={14} className={isSelected ? "text-[#852BAF]" : "text-white"} />
        )}
      </span>
      <span className={`max-w-[52px] truncate text-[9px] font-bold ${isSelected ? "text-white" : "text-white/70"}`}>{module.label}</span>
      {isSelected && <span className="h-1 w-1 rounded-full bg-white" />}
    </button>
  );
}

export default function MobileNavbarPreview({ entry, moduleIcons, previewModule, onSelectModule }: Props) {
  const activeModules = [...moduleIcons].filter((m) => m.is_active).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="relative" style={backgroundStyle(entry)}>
      {/* Bottom scrim so the light content stays legible over any uploaded artwork, mirroring the production header. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-black/35" />

      <div className="relative px-4 pb-4 pt-1 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20">
              <FiUser size={15} />
            </span>
            <div>
              <p className="text-[13px] font-black leading-tight">Hello, there!</p>
              <p className="flex items-center gap-1 text-[10px] text-white/70">
                <FiMapPin size={10} /> Your city
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15">
              <FiGift size={14} />
            </span>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15">
              <FiBell size={14} />
            </span>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-full bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-400">
          <FiSearch size={13} className="text-slate-400" />
          Search products, services &amp; more
        </div>

        {activeModules.length > 0 ? (
          <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
            {activeModules.map((module) => (
              <ModuleIconTile
                key={module.module_key}
                module={module}
                isSelected={previewModule === module.module_key}
                onSelect={() => onSelectModule(module.module_key)}
              />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-[11px] font-semibold text-white/60">No modules configured</p>
        )}
      </div>
    </div>
  );
}
