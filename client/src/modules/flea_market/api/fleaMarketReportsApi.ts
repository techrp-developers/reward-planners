import { fleaMarketClient } from "./fleaMarketClient";
import type { InvoiceDetail } from "./fleaMarketInvoiceApi";

export interface VendorSalesRow {
  vendorId: number;
  vendorName: string;
  productId: number;
  productName: string;
  brandName: string | null;
  variantId: number;
  sku: string;
  scheduleId: number;
  scheduledDate: string;
  clientCompanyName: string;
  allocatedQty: number;
  soldQty: number;
  damagedQty: number;
  returnedQty: number;
  allocationPrice: number | null;
  catalogSalePrice: number;
  effectivePrice: number;
  grossRevenue: number;
  sellThroughPct: number;
  pointsRedeemed: number;
}

export interface VendorSalesVendor {
  vendorId: number;
  vendorName: string;
  productsSold: VendorSalesRow[];
  totalAllocated: number;
  totalUnitsSold: number;
  totalDamaged: number;
  totalReturned: number;
  totalRevenue: number;
  totalPointsRedeemed: number;
  sellThroughPct: number;
}

export interface VendorSalesSummary {
  totalAllocated: number;
  totalSold: number;
  totalDamaged: number;
  totalReturned: number;
  totalGrossRevenue: number;
  totalPointsRedeemed: number;
  totalVendorsInvolved: number;
  totalEventsIncluded: number;
  sellThroughPct: number;
}

export interface VendorSalesReportResponse {
  rows: VendorSalesRow[];
  vendors: VendorSalesVendor[];
  summary: VendorSalesSummary;
  scheduleJoinReliability: string;
}

export interface VendorSalesReportFilters {
  companyId: number;
  scheduleId?: number | null;
  fromDate?: string;
  toDate?: string;
  vendorId?: number | null;
  productId?: number | null;
}

export interface ReportScheduleOption {
  scheduleId: number;
  companyId: number;
  companyName: string;
  locationId: number;
  locationName: string;
  scheduledDate: string;
  startTime: string | null;
  endTime: string | null;
  status: string;
}

export interface PurchaseHistoryRow {
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  userId: number;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  clientCompanyName: string;
  vendorId: number;
  vendorName: string;
  productId: number;
  productName: string;
  brandName: string | null;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  pointsRedeemed: number;
  amountPaid: number;
  scheduleId: number | null;
  scheduledDate: string | null;
}

export interface PurchaseHistoryFilters {
  companyId?: number | null;
  vendorId?: number | null;
  productId?: number | null;
  userId?: number | null;
  scheduleId?: number | null;
  fromDate?: string;
  toDate?: string;
  page: number;
  limit: number;
}

export interface PurchaseHistoryResponse {
  rows: PurchaseHistoryRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PurchaseHistoryFilterOptions {
  companies: FleaMarketReportCompanyOption[];
  vendors: { vendorId: number; vendorName: string }[];
  products: { productId: number; productName: string; brandName: string | null }[];
  schedules: ReportScheduleOption[];
}

export interface FleaMarketReportCompanyOption {
  companyId: number;
  companyName: string;
}

interface ReportApiResponse<T> {
  success: boolean;
  data: T;
}

function toParams(filters: VendorSalesReportFilters) {
  return {
    company_id: filters.companyId,
    ...(filters.scheduleId ? { schedule_id: filters.scheduleId } : {}),
    ...(!filters.scheduleId && filters.fromDate ? { from_date: filters.fromDate } : {}),
    ...(!filters.scheduleId && filters.toDate ? { to_date: filters.toDate } : {}),
    ...(filters.vendorId ? { vendor_id: filters.vendorId } : {}),
    ...(filters.productId ? { product_id: filters.productId } : {}),
  };
}

export async function fetchVendorSalesReport(
  filters: VendorSalesReportFilters,
): Promise<VendorSalesReportResponse> {
  const { data } = await fleaMarketClient.get<ReportApiResponse<VendorSalesReportResponse>>(
    "/reports/vendor-sales-summary",
    { params: toParams(filters) },
  );
  return data.data;
}

export async function listReportSchedules(companyId: number): Promise<ReportScheduleOption[]> {
  const { data } = await fleaMarketClient.get<ReportApiResponse<{ schedules: ReportScheduleOption[] }>>(
    "/reports/filter-options",
    { params: { company_id: companyId } },
  );
  return data.data.schedules;
}

function toPurchaseHistoryParams(filters: PurchaseHistoryFilters) {
  return {
    ...(filters.companyId ? { company_id: filters.companyId } : {}),
    ...(filters.vendorId ? { vendor_id: filters.vendorId } : {}),
    ...(filters.productId ? { product_id: filters.productId } : {}),
    ...(filters.userId ? { user_id: filters.userId } : {}),
    ...(filters.scheduleId ? { schedule_id: filters.scheduleId } : {}),
    ...(filters.fromDate ? { from_date: filters.fromDate } : {}),
    ...(filters.toDate ? { to_date: filters.toDate } : {}),
    page: filters.page,
    limit: filters.limit,
  };
}

export async function fetchPurchaseHistory(filters: PurchaseHistoryFilters): Promise<PurchaseHistoryResponse> {
  const { data } = await fleaMarketClient.get<ReportApiResponse<PurchaseHistoryResponse>>(
    "/reports/purchase-history",
    { params: toPurchaseHistoryParams(filters) },
  );
  return data.data;
}

export async function fetchPurchaseHistoryFilterOptions(): Promise<PurchaseHistoryFilterOptions> {
  const { data } = await fleaMarketClient.get<ReportApiResponse<PurchaseHistoryFilterOptions>>(
    "/reports/purchase-history/filter-options",
  );
  return data.data;
}

// Manager-facing invoice detail — deliberately NOT fleaMarketInvoiceApi's
// fetchInvoice(), which requires a customer OTP session (X-Session-Token)
// that doesn't exist when a manager is browsing Purchase History.
export async function fetchReportInvoiceDetail(invoiceId: number): Promise<InvoiceDetail> {
  const { data } = await fleaMarketClient.get<ReportApiResponse<InvoiceDetail>>(`/reports/invoices/${invoiceId}`);
  return data.data;
}
