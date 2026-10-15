import type { ContentEntry } from "../types";
import PromotionalBanner from "./PromotionalBanner";

export default function MobileOffersPreview({ entry }: { entry?: ContentEntry }) {
  if (!entry) return null;
  return (
    <section>
      <h4 className="mb-2 px-3 text-sm font-bold text-white">{entry.title || "Offers"}</h4>
      <PromotionalBanner entry={entry} />
    </section>
  );
}
