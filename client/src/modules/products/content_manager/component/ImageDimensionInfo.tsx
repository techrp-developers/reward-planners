import { useRef, useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiUploadCloud } from "react-icons/fi";
import type { Zone } from "../types";
import { ZONES } from "../types";
import {
  aspectRatioLabel,
  formatFileSize,
  isLowResolution,
  ratioStatus,
  useImageDimensions,
  ZONE_IMAGE_SPECS,
} from "../utils/imageDimensions";

interface Props {
  zone: Zone;
  /** Current image to show - a fresh selection's data URL, or the already-saved remote URL. */
  imageUrl: string;
  /** Set only right after a fresh file selection, so we can read its real byte size. Cleared once saved. */
  file?: File | null;
  onSelectFile: (file: File) => void;
}

export default function ImageDimensionInfo({ zone, imageUrl, file, onSelectFile }: Props) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const spec = ZONE_IMAGE_SPECS[zone];
  const zoneLabel = ZONES.find((z) => z.key === zone)?.label ?? zone;
  const dims = useImageDimensions(imageUrl && imageUrl !== brokenUrl ? imageUrl : null);

  const ratio = dims ? dims.width / dims.height : null;
  const status = dims && ratio ? ratioStatus(ratio, spec.recommendedRatio) : null;
  const lowRes = dims ? isLowResolution(dims.width, dims.height, spec) : false;
  const oversized = !!file && file.size > spec.maxFileSize;

  const handlePick = (picked: File | undefined) => {
    if (!picked) return;
    setBrokenUrl(null);
    onSelectFile(picked);
  };

  if (!imageUrl || imageUrl === brokenUrl) {
    return (
      <div className="mt-2">
        <label
          className="grid w-full max-w-xs cursor-pointer place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 py-8 text-slate-400 hover:border-purple-300 hover:text-[#852BAF]"
          style={{ aspectRatio: `${spec.recommendedWidth} / ${spec.recommendedHeight}`, maxHeight: 220 }}
        >
          <span className="flex flex-col items-center gap-2 px-4 text-center text-xs font-bold">
            <FiUploadCloud className="text-xl" />
            Choose an image
          </span>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => handlePick(event.target.files?.[0])} />
        </label>
        <p className="mt-2 text-[11px] text-slate-400">
          Recommended: {spec.recommendedWidth} × {spec.recommendedHeight} px · Ratio {spec.recommendedRatioLabel} · {spec.typeLabel}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
      <div
        className="w-full max-w-[220px] shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
        style={{ aspectRatio: dims ? `${dims.width} / ${dims.height}` : `${spec.recommendedWidth} / ${spec.recommendedHeight}` }}
      >
        <img src={imageUrl} alt="" className="h-full w-full object-contain" onError={() => setBrokenUrl(imageUrl)} />
      </div>

      <div className="flex-1 space-y-1.5 text-xs">
        {dims ? (
          <>
            <p className="font-bold text-slate-700">
              {dims.width} × {dims.height} px <span className="font-normal text-slate-400">· Aspect Ratio {aspectRatioLabel(dims.width, dims.height)}</span>
            </p>

            {status === "match" ? (
              <p className="flex items-center gap-1.5 font-semibold text-emerald-600">
                <FiCheckCircle /> Recommended ratio for {zoneLabel}
              </p>
            ) : (
              <p className="flex items-center gap-1.5 font-semibold text-amber-600">
                <FiAlertTriangle /> Different aspect ratio from the recommended {spec.recommendedRatioLabel} - you can still continue
              </p>
            )}

            {lowRes && (
              <p className="flex items-center gap-1.5 font-semibold text-amber-600">
                <FiAlertTriangle /> Image resolution is lower than recommended ({spec.recommendedWidth} × {spec.recommendedHeight} px)
              </p>
            )}
          </>
        ) : (
          <p className="text-slate-400">Reading image dimensions…</p>
        )}

        {file && (
          <p className={oversized ? "font-semibold text-amber-600" : "text-slate-500"}>
            File size: {formatFileSize(file.size)}
            {oversized && <> — exceeds the recommended {formatFileSize(spec.maxFileSize)} limit</>}
          </p>
        )}

        <p className="text-slate-400">
          Recommended: {spec.recommendedWidth} × {spec.recommendedHeight} px · Preferred ratio {spec.recommendedRatioLabel}
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-1 rounded-lg bg-purple-50 px-3 py-1.5 text-[11px] font-bold text-[#852BAF] hover:bg-purple-100"
        >
          Choose another image
        </button>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(event) => handlePick(event.target.files?.[0])} />
      </div>
    </div>
  );
}
