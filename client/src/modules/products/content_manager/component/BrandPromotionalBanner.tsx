import type { ContentEntry } from "../types";
import PromotionalBanner from "./PromotionalBanner";

export default function BrandPromotionalBanner({ entry }: { entry: ContentEntry | null }) {
  return <PromotionalBanner entry={entry} />;
}
