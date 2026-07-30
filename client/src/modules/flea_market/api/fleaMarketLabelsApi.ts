export type LabelPrintFormat = "thermal" | "a4sheet";

// Matches fleaMarketClient's baseURL — these are opened directly via
// window.open (the response is a PDF, not JSON), not routed through the
// axios instance. Label print endpoints have no auth requirement, matching
// the rest of the manager-facing flea market routes.
const BASE = "/api/flea-market";

export function getLabelPrintUrl(poolId: number, format: LabelPrintFormat): string {
  return `${BASE}/vendor-stock/${poolId}/label/print?format=${format}`;
}

// Bulk print target — every currently-active pool, not scoped to one event
// (pools aren't schedule-scoped anymore).
export function getAllLabelsPrintUrl(format: LabelPrintFormat): string {
  return `${BASE}/vendor-stock/labels/print?format=${format}`;
}
