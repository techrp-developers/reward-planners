export type LabelPrintFormat = "thermal" | "a4sheet";

// Matches fleaMarketClient's baseURL — these are opened directly via
// window.open (the response is a PDF, not JSON), not routed through the
// axios instance. Label print endpoints have no auth requirement, matching
// the rest of the manager-facing flea market routes.
const BASE = "/api/flea-market";

export function getLabelPrintUrl(allocationId: number, format: LabelPrintFormat): string {
  return `${BASE}/allocations/${allocationId}/label/print?format=${format}`;
}

export function getScheduleLabelsPrintUrl(scheduleId: number, format: LabelPrintFormat): string {
  return `${BASE}/schedules/${scheduleId}/labels/print?format=${format}`;
}
