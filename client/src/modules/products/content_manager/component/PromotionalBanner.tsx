import { useEffect, useRef, useState } from "react";
import { getResolvedZones, type ContentModule } from "../api/ContentApi";
import { fromApiEntry } from "../store/mappers";
import type { ContentEntry, ContentZoneImage } from "../types";
import { cmsColorToBackground } from "../utils/cmsColor";
import { useImageDimensions } from "../utils/imageDimensions";
import {
  DEFAULT_BANNER_ASPECT_RATIO,
  DEFAULT_GRID_ASPECT_RATIO,
  extractPromotionalImages,
  resolveDisplayMode,
} from "../utils/promotionalBanner";

interface Props {
  /** Self-fetches via GET /content/resolved/:module (public, no auth header). Ignored when `entry` is passed. */
  module?: ContentModule;
  /** Already-resolved promotional_banner entry (e.g. from a parent that fetched all zones at once, same convention as LivePreviewPanel). */
  entry?: ContentEntry | null;
  /** Wrapper class - defaults to the horizontal padding the CMS preview already uses. */
  className?: string;
}

function useResolvedPromotionalEntry(module: ContentModule | undefined, entryProp: ContentEntry | null | undefined) {
  const [fetched, setFetched] = useState<ContentEntry | null>(null);

  useEffect(() => {
    if (entryProp !== undefined || !module) return;

    let cancelled = false;
    getResolvedZones(module)
      .then((zones) => {
        if (!cancelled) setFetched(zones.promotional_banner ? fromApiEntry(zones.promotional_banner) : null);
      })
      .catch(() => {
        if (!cancelled) setFetched(null);
      });

    return () => {
      cancelled = true;
    };
  }, [module, entryProp]);

  return entryProp !== undefined ? entryProp : fetched;
}

export default function PromotionalBanner({ module, entry: entryProp, className = "px-3" }: Props) {
  const entry = useResolvedPromotionalEntry(module, entryProp);

  if (!entry) return null;

  if (entry.contentType === "color") {
    return <ColorBanner entry={entry} className={className} />;
  }

  const promotionalImages = extractPromotionalImages(entry);
  if (promotionalImages.length === 0) return null;

  // The CMS-selected display_mode is the source of truth - never re-derived from image count.
  switch (resolveDisplayMode(entry.displayMode)) {
    case "single":
      return <SingleBanner image={promotionalImages[0]} className={className} />;
    case "grid_2":
      return <BannerGrid images={promotionalImages} columns={2} className={className} />;
    case "grid_3":
      return <BannerGrid images={promotionalImages} columns={3} className={className} />;
    case "carousel":
      return <BannerCarousel images={promotionalImages} className={className} />;
  }
}

function ColorBanner({ entry, className }: { entry: ContentEntry; className: string }) {
  return (
    <div className={className}>
      <div
        className="flex w-full flex-col items-start justify-center gap-1.5 rounded-2xl px-5 py-5 text-white"
        style={{ aspectRatio: DEFAULT_BANNER_ASPECT_RATIO, ...cmsColorToBackground(entry.colorValue) }}
      >
        <p className="text-lg font-black leading-tight [text-shadow:0_1px_4px_rgba(0,0,0,0.45)]">
          {entry.title || "Promotional Banner"}
        </p>
        {entry.ctaText && (
          <span className="mt-1 inline-flex w-fit items-center rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-slate-900">
            {entry.ctaText}
          </span>
        )}
      </div>
    </div>
  );
}

/** One image, sized from its own natural aspect ratio - falls back to a constant until it loads, so the container never collapses then expands. */
function BannerImage({
  image,
  fallbackAspectRatio,
  className = "",
}: {
  image: ContentZoneImage;
  fallbackAspectRatio: number;
  className?: string;
}) {
  const dims = useImageDimensions(image.imageUrl);
  const aspectRatio = dims ? dims.width / dims.height : fallbackAspectRatio;

  return (
    <div className={`overflow-hidden rounded-2xl bg-slate-800 ${className}`} style={{ aspectRatio }}>
      <img src={image.imageUrl} alt="" className="h-full w-full object-contain" loading="lazy" />
    </div>
  );
}

function SingleBanner({ image, className }: { image: ContentZoneImage; className: string }) {
  return (
    <div className={className}>
      <BannerImage image={image} fallbackAspectRatio={DEFAULT_BANNER_ASPECT_RATIO} className="w-full" />
    </div>
  );
}

const GRID_COLUMN_CLASS: Record<1 | 2 | 3, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
};

/** Renders whatever images are available - fewer than `columns` shares the full width evenly instead of leaving dead space, no placeholder tiles. */
function BannerGrid({ images, columns, className }: { images: ContentZoneImage[]; columns: 2 | 3; className: string }) {
  const effectiveColumns = Math.min(columns, images.length) as 1 | 2 | 3;

  return (
    <div className={`grid ${GRID_COLUMN_CLASS[effectiveColumns]} gap-2.5 ${className}`}>
      {images.map((image) => (
        <BannerImage
          key={image.imageId ?? image.imageUrl}
          image={image}
          fallbackAspectRatio={DEFAULT_GRID_ASPECT_RATIO}
          className="w-full"
        />
      ))}
    </div>
  );
}

function BannerCarousel({ images, className }: { images: ContentZoneImage[]; className: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handleScroll = () => {
    if (rafRef.current !== null) return;

    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = scrollerRef.current;
      if (!el || !el.clientWidth) return;

      const index = Math.round(el.scrollLeft / el.clientWidth);
      const clamped = Math.max(0, Math.min(index, images.length - 1));
      setActiveIndex((prev) => (prev === clamped ? prev : clamped));
    });
  };

  const scrollToIndex = (index: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className={className}>
      <div
        ref={scrollerRef}
        onScroll={handleScroll}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((image) => (
          <div key={image.imageId ?? image.imageUrl} className="w-full shrink-0 snap-start">
            <BannerImage image={image} fallbackAspectRatio={DEFAULT_BANNER_ASPECT_RATIO} className="w-full" />
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-center gap-1.5">
        {images.map((image, index) => (
          <button
            key={image.imageId ?? image.imageUrl}
            type="button"
            aria-label={`Go to slide ${index + 1}`}
            onClick={() => scrollToIndex(index)}
            className={`h-1.5 rounded-full transition-all ${index === activeIndex ? "w-4 bg-white" : "w-1.5 bg-white/40"}`}
          />
        ))}
      </div>
    </div>
  );
}
