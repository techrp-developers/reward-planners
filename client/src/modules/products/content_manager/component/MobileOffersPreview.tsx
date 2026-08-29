import { FiChevronRight } from "react-icons/fi";
import type { ContentEntry, ContentZoneImage } from "../types";
import { cmsColorToBackground } from "../utils/cmsColor";
import { useImageDimensions, ZONE_IMAGE_SPECS } from "../utils/imageDimensions";

interface Props {
  entry?: ContentEntry;
}

const SPEC = ZONE_IMAGE_SPECS.offers_banner;

function OfferCard({ image }: { image: ContentZoneImage }) {
  const dims = useImageDimensions(image.imageUrl);
  const aspectRatio = dims ? `${dims.width} / ${dims.height}` : `${SPEC.recommendedWidth} / ${SPEC.recommendedHeight}`;

  return (
    <div className="w-28 shrink-0 overflow-hidden rounded-xl bg-slate-800" style={{ aspectRatio }}>
      <img src={image.imageUrl} alt="" className="h-full w-full object-contain" />
    </div>
  );
}

export default function MobileOffersPreview({ entry }: Props) {
  if (!entry) return null;

  const images = entry?.contentType === "image" ? [...(entry.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder) : [];

  return (
    <div className="px-3 pb-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-black text-white">{entry?.title || "Best Picks for You"}</p>
        <span className="flex items-center gap-0.5 text-[10px] font-bold text-white/50">
          View All <FiChevronRight size={12} />
        </span>
      </div>

      {entry?.contentType === "image" ? (
        images.length > 0 ? (
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {images.map((image) => (
              <OfferCard key={image.imageId ?? image.imageUrl} image={image} />
            ))}
          </div>
        ) : null
      ) : entry?.contentType === "color" ? (
        <div
          className="flex w-40 items-center justify-center rounded-xl text-[11px] font-bold text-white"
          style={{ ...cmsColorToBackground(entry.colorValue), aspectRatio: `${SPEC.recommendedWidth} / ${SPEC.recommendedHeight}` }}
        >
          {entry.title || "Offers"}
        </div>
      ) : null}
    </div>
  );
}
