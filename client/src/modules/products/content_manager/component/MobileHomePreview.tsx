import type { ContentEntry, Zone } from "../types";
import type { ResolvedModuleIcon } from "../api/ModuleIconApi";
import MobileStatusBar from "./MobileStatusBar";
import MobileNavbarPreview from "./MobileNavbarPreview";
import MobilePromoPreview from "./MobilePromoPreview";
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
  const offers = resolve("offers_banner");

  return (
    <div className="flex min-h-full flex-col bg-[#0B0617]">
      <MobileStatusBar />
      <MobileNavbarPreview entry={navbar} moduleIcons={moduleIcons} previewModule={previewModule} onSelectModule={onSelectModule} />

      <div className="flex-1 space-y-4 py-4">
        <MobilePromoPreview entry={promo} />
        <MobileOffersPreview entry={offers} />
      </div>

      <MobileBottomNav />
    </div>
  );
}
