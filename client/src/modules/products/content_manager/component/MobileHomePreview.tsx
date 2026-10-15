import type { ContentEntry, Zone } from "../types";
import type { ResolvedModuleIcon } from "../api/ModuleIconApi";
import MobileStatusBar from "./MobileStatusBar";
import MobileNavbarPreview from "./MobileNavbarPreview";
import BrandPromotionalBanner from "./BrandPromotionalBanner";
import PromotionalBanner from "./PromotionalBanner";
import MobileOffersPreview from "./MobileOffersPreview";
import MobileBottomNav from "./MobileBottomNav";

interface Props {
  resolve: (zone: Zone) => ContentEntry | undefined;
  moduleIcons: ResolvedModuleIcon[];
  previewModule: string;
  onSelectModule: (moduleKey: string) => void;
}

/** Composes the CMS-controlled zones into one scrollable "home screen" - the same shape as the real app's layout. */
export default function MobileHomePreview({ resolve, moduleIcons, previewModule, onSelectModule }: Props) {
  const navbar = resolve("navbar_background");
  const promo = resolve("promotional_banner");
  const brand = resolve("brand_promotional_banner");
  const offers = resolve("offers_banner");

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0B0617]">
      <div className="shrink-0"><MobileStatusBar /></div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <MobileNavbarPreview entry={navbar} moduleIcons={moduleIcons} previewModule={previewModule} onSelectModule={onSelectModule} />
        <div className="space-y-4 pb-4">
        <PromotionalBanner entry={promo ?? null} />
        <BrandPromotionalBanner entry={brand ?? null} />
        <MobileOffersPreview entry={offers} />
        </div>
      </div>

      <div className="shrink-0"><MobileBottomNav /></div>
    </div>
  );
}
