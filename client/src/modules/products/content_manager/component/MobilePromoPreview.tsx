import { useState } from "react";
import { FiCheckCircle } from "react-icons/fi";
import type { ContentEntry } from "../types";
import { cmsColorToBackground } from "../utils/cmsColor";
import { ratioStatus, useImageDimensions, ZONE_IMAGE_SPECS } from "../utils/imageDimensions";

interface Props {
  entry?: ContentEntry;
}

const SPEC = ZONE_IMAGE_SPECS.promotional_banner;

export default function MobilePromoPreview({ entry }: Props) {
  const [broken, setBroken] = useState(false);
  const hasImage = entry?.contentType === "image" && !!entry.imageUrl && !broken;
  const dims = useImageDimensions(hasImage ? entry?.imageUrl : null);

  const aspectRatio = dims ? `${dims.width} / ${dims.height}` : `${SPEC.recommendedWidth} / ${SPEC.recommendedHeight}`;
  const status = dims ? ratioStatus(dims.width / dims.height, SPEC.recommendedRatio) : null;

  if (!entry) return null;

  if (hasImage) {
    return (
      <div className="px-3">
        <div className="w-full overflow-hidden rounded-2xl bg-slate-800" style={{ aspectRatio }}>
          <img src={entry.imageUrl} alt="" className="h-full w-full object-contain" onError={() => setBroken(true)} />
        </div>
        {dims && (
          <p className={`mt-1 px-1 text-[10px] font-semibold ${status === "match" ? "text-emerald-600" : "text-amber-600"}`}>
            {status === "match" ? (
              <span className="inline-flex items-center gap-1"><FiCheckCircle size={11} /> Looks correct at this preview width</span>
            ) : (
              "Banner shape differs a little from the recommended artwork - it will still display fine"
            )}
          </p>
        )}
      </div>
    );
  }

  if (entry?.contentType === "color") {
    return (
      <div className="px-3">
        <div
          className="flex w-full flex-col items-start justify-center gap-1.5 rounded-2xl px-5 py-5 text-white"
          style={{ aspectRatio, ...cmsColorToBackground(entry.colorValue) }}
        >
          <p className="text-lg font-black leading-tight [text-shadow:0_1px_4px_rgba(0,0,0,0.45)]">{entry.title || "Promotional Banner"}</p>
          {entry.ctaText && (
            <span className="mt-1 inline-flex w-fit items-center rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-900">
              {entry.ctaText}
            </span>
          )}
        </div>
      </div>
    );
  }

  return null;
}
