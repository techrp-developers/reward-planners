import { ZONES } from "../types";
import { formatFileSize, ZONE_IMAGE_SPECS } from "../utils/imageDimensions";

/** Static reference so an admin can check every zone's recommended artwork size without switching zones. */
export default function AssetSpecPanel() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Recommended Asset Specifications</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {ZONES.map(({ key, label }) => {
          const spec = ZONE_IMAGE_SPECS[key];
          return (
            <div key={key} className="rounded-lg border border-slate-200 bg-white p-2.5">
              <p className="text-[11px] font-black text-slate-700">{label}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {spec.recommendedWidth} × {spec.recommendedHeight} px
              </p>
              <p className="text-[11px] text-slate-500">Ratio {spec.recommendedRatioLabel}</p>
              <p className="text-[11px] text-slate-500">PNG/JPG, max {formatFileSize(spec.maxFileSize)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
