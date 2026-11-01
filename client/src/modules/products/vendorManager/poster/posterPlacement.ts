export type PosterPlacement = "ecommerce" | "service" | "dashboard";

export const POSTER_PLACEMENTS: Array<{
  key: PosterPlacement;
  label: string;
  campaignType: "poster" | "dashboard_poster";
  module: "product" | "service";
  selectorModule: "product" | "service" | "mobile_dashboard";
}> = [
  { key: "ecommerce", label: "Ecommerce home", campaignType: "poster", module: "product", selectorModule: "product" },
  { key: "service", label: "Service home", campaignType: "poster", module: "service", selectorModule: "service" },
  { key: "dashboard", label: "Main dashboard", campaignType: "dashboard_poster", module: "product", selectorModule: "mobile_dashboard" },
];

export const placementOf = (campaignType: string, module?: string): PosterPlacement =>
  campaignType === "dashboard_poster" ? "dashboard" : module === "service" ? "service" : "ecommerce";

export const placementDetails = (placement: PosterPlacement) =>
  POSTER_PLACEMENTS.find((item) => item.key === placement) ?? POSTER_PLACEMENTS[0];
