import { fleaMarketClient } from "./fleaMarketClient";

// Replaces fleaMarketAllocationsApi.ts now that stock lives in a persistent
// per-(vendor,variant) pool rather than a row per event — see
// server/scripts/migrate-allocations-to-vendor-stock.js for the migration.

export type PoolStatus = "active" | "closed";

export interface FleaMarketVendorStockPool {
  poolId: number;
  vendorId: number;
  vendorName: string;
  productId: number;
  productName: string;
  variantId: number;
  sku: string;
  allocatedQty: number;
  soldQty: number;
  damagedQty: number;
  returnedQty: number;
  availableQty: number;
  allocationPrice: number | null;
  status: PoolStatus;
}

interface PoolListResponse {
  success: boolean;
  data: FleaMarketVendorStockPool[];
}

interface PoolItemResponse {
  success: boolean;
  data: FleaMarketVendorStockPool;
}

// Unscoped — every active/closed pool, regardless of which event it was
// topped up during (pools persist across events now).
export async function listVendorStockPools(): Promise<FleaMarketVendorStockPool[]> {
  const { data } = await fleaMarketClient.get<PoolListResponse>("/vendor-stock");
  return data.data;
}

export interface TopUpPayload {
  vendorId: number;
  productId: number;
  variantId: number;
  allocatedQty: number;
  allocationPrice?: number;
  // Optional — only tags the resulting log with this event if it's actually
  // live right now; otherwise it's a warehouse-level top-up between events.
  scheduleId?: number;
}

// Creates the pool on the first top-up for this vendor+variant, or adds to
// the existing pool otherwise (never a duplicate row per event).
export async function topUpVendorStock(payload: TopUpPayload): Promise<FleaMarketVendorStockPool> {
  const { data } = await fleaMarketClient.post<PoolItemResponse>("/vendor-stock", payload);
  return data.data;
}

export async function recordDamage(
  poolId: number,
  quantity: number,
  remarks: string,
  scheduleId?: number,
): Promise<FleaMarketVendorStockPool> {
  const { data } = await fleaMarketClient.patch<PoolItemResponse>(`/vendor-stock/${poolId}/damage`, {
    quantity,
    remarks,
    scheduleId,
  });
  return data.data;
}

export async function adjustPool(poolId: number, quantity: number, remarks: string): Promise<FleaMarketVendorStockPool> {
  const { data } = await fleaMarketClient.patch<PoolItemResponse>(`/vendor-stock/${poolId}/adjust`, {
    quantity,
    remarks,
  });
  return data.data;
}

// Explicit end-of-program action — NOT triggered by any event closing
// anymore, since the pool persists across events.
export async function returnToVendor(
  poolId: number,
  returnQty: number,
  remarks: string,
  closePool?: boolean,
): Promise<FleaMarketVendorStockPool> {
  const { data } = await fleaMarketClient.post<PoolItemResponse>(`/vendor-stock/${poolId}/return`, {
    returnQty,
    remarks,
    closePool,
  });
  return data.data;
}

// Price-only edit — pass null to clear the price. Doesn't touch quantities.
export async function updatePoolPrice(poolId: number, allocationPrice: number | null): Promise<FleaMarketVendorStockPool> {
  const { data } = await fleaMarketClient.patch<PoolItemResponse>(`/vendor-stock/${poolId}/price`, {
    allocationPrice,
  });
  return data.data;
}

// Only succeeds for a pool with zero sold/damaged/returned history — the
// backend guards this and returns a 409 otherwise (use Return to Vendor for
// pools with any activity). Reverses whatever's still allocated back to the
// vendor's master stock.
export async function deletePool(poolId: number): Promise<void> {
  await fleaMarketClient.delete(`/vendor-stock/${poolId}`);
}

export interface PoolLog {
  logId: number;
  poolId: number;
  scheduleId: number | null;
  action: "allocated" | "sale" | "return" | "damage" | "adjustment";
  quantity: number;
  remarks: string | null;
  createdAt: string;
}

interface PoolLogsResponse {
  success: boolean;
  data: PoolLog[];
}

export async function fetchPoolLogs(poolId: number): Promise<PoolLog[]> {
  const { data } = await fleaMarketClient.get<PoolLogsResponse>(`/vendor-stock/${poolId}/logs`);
  return data.data;
}

// "How did THIS specific event perform" — read-only, doesn't close or gate
// anything, sourced from the log table (pools aren't per-event anymore).
export interface EventSummaryRow {
  vendorId: number;
  vendorName: string;
  productId: number;
  productName: string;
  variantId: number;
  sku: string;
  soldQty: number;
  damagedQty: number;
}

interface EventSummaryResponse {
  success: boolean;
  data: EventSummaryRow[];
}

export async function fetchEventSummary(scheduleId: number): Promise<EventSummaryRow[]> {
  const { data } = await fleaMarketClient.get<EventSummaryResponse>(`/schedules/${scheduleId}/event-summary`);
  return data.data;
}
