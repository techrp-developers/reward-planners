import { api } from "../../../../common/api/api";

/* ================= TYPES ================= */

export interface VendorFleaMarketPurchaseRow {
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  scheduleId: number | null;
  scheduledDate: string | null;
  clientCompanyName: string;
  productId: number;
  productName: string;
  brandName: string | null;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  // Masked server-side — raw customer PII never reaches this client at all.
  customerNameMasked: string | null;
  customerPhoneMasked: string | null;
}

export interface VendorFleaMarketPurchasesSummary {
  totalUnitsSold: number;
  totalRevenue: number;
  totalOrders: number;
}

export interface VendorFleaMarketPurchasesResponse {
  rows: VendorFleaMarketPurchaseRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: VendorFleaMarketPurchasesSummary;
}

export interface VendorFleaMarketPurchasesFilters {
  scheduleId?: number | null;
  fromDate?: string;
  toDate?: string;
  page: number;
  limit: number;
}

export interface VendorFleaMarketScheduleOption {
  scheduleId: number;
  scheduledDate: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
  hostCompanyName: string;
}

export interface VendorFleaMarketPurchasesFilterOptions {
  schedules: VendorFleaMarketScheduleOption[];
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

function toParams(filters: VendorFleaMarketPurchasesFilters) {
  return {
    ...(filters.scheduleId ? { schedule_id: filters.scheduleId } : {}),
    ...(!filters.scheduleId && filters.fromDate ? { from_date: filters.fromDate } : {}),
    ...(!filters.scheduleId && filters.toDate ? { to_date: filters.toDate } : {}),
    page: filters.page,
    limit: filters.limit,
  };
}

// Reuses the vendor dashboard's existing authenticated axios instance
// (Bearer token from localStorage, see common/api/api.ts) — vendor_id
// itself is never sent from here; the backend resolves it from the
// authenticated session.
export async function fetchVendorFleaMarketPurchases(
  filters: VendorFleaMarketPurchasesFilters,
): Promise<VendorFleaMarketPurchasesResponse> {
  const { data } = await api.get<ApiResponse<VendorFleaMarketPurchasesResponse>>("/vendor/flea-market/purchases", {
    params: toParams(filters),
  });
  return data.data;
}

export async function fetchVendorFleaMarketPurchasesFilterOptions(): Promise<VendorFleaMarketPurchasesFilterOptions> {
  const { data } = await api.get<ApiResponse<VendorFleaMarketPurchasesFilterOptions>>(
    "/vendor/flea-market/purchases/filter-options",
  );
  return data.data;
}
