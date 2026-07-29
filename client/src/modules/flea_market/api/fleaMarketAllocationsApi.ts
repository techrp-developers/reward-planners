import { fleaMarketClient } from "./fleaMarketClient";

export type AllocationStatus = "allocated" | "active" | "completed" | "closed";

export interface FleaMarketAllocation {
  allocationId: number;
  scheduleId: number;
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
  status: AllocationStatus;
}

export interface ReconciliationRow extends FleaMarketAllocation {
  wouldReturnQty: number;
}

export interface CloseSummaryRow {
  allocationId: number;
  vendorId: number;
  productId: number;
  variantId: number;
  allocatedQty: number;
  soldQty: number;
  damagedQty: number;
  returnedQty: number;
}

interface AllocationListResponse {
  success: boolean;
  data: FleaMarketAllocation[];
}

interface AllocationItemResponse {
  success: boolean;
  data: FleaMarketAllocation;
}

interface ReconciliationResponse {
  success: boolean;
  data: ReconciliationRow[];
}

interface CloseResponse {
  success: boolean;
  data: CloseSummaryRow[];
}

export async function listAllocations(scheduleId: number): Promise<FleaMarketAllocation[]> {
  const { data } = await fleaMarketClient.get<AllocationListResponse>("/allocations", {
    params: { schedule_id: scheduleId },
  });
  return data.data;
}

export interface CreateAllocationPayload {
  scheduleId: number;
  vendorId: number;
  productId: number;
  variantId: number;
  allocatedQty: number;
  allocationPrice?: number;
}

export async function createAllocation(payload: CreateAllocationPayload): Promise<FleaMarketAllocation> {
  const { data } = await fleaMarketClient.post<AllocationItemResponse>("/allocations", payload);
  return data.data;
}

export async function recordDamage(allocationId: number, quantity: number, remarks: string): Promise<FleaMarketAllocation> {
  const { data } = await fleaMarketClient.patch<AllocationItemResponse>(`/allocations/${allocationId}/damage`, {
    quantity,
    remarks,
  });
  return data.data;
}

export async function adjustAllocation(allocationId: number, quantity: number, remarks: string): Promise<FleaMarketAllocation> {
  const { data } = await fleaMarketClient.patch<AllocationItemResponse>(`/allocations/${allocationId}/adjust`, {
    quantity,
    remarks,
  });
  return data.data;
}

export async function fetchReconciliationPreview(scheduleId: number): Promise<ReconciliationRow[]> {
  const { data } = await fleaMarketClient.get<ReconciliationResponse>(`/schedules/${scheduleId}/reconciliation`);
  return data.data;
}

export async function closeSchedule(scheduleId: number): Promise<CloseSummaryRow[]> {
  const { data } = await fleaMarketClient.post<CloseResponse>(`/schedules/${scheduleId}/close`);
  return data.data;
}

export interface AllocationLog {
  logId: number;
  allocationId: number;
  action: "allocated" | "sale" | "return" | "damage" | "adjustment";
  quantity: number;
  remarks: string | null;
  createdAt: string;
}

interface AllocationLogsResponse {
  success: boolean;
  data: AllocationLog[];
}

export async function fetchAllocationLogs(allocationId: number): Promise<AllocationLog[]> {
  const { data } = await fleaMarketClient.get<AllocationLogsResponse>(`/allocations/${allocationId}/logs`);
  return data.data;
}
