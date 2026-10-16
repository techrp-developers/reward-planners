import { fleaMarketClient } from './fleaMarketClient';
export interface DashboardFilters { companyId?: number; scheduleId?: number; fromDate?: string; toDate?: string }
type Value = number | string;
export interface DashboardSummary {
  event: null | {scheduleId:number; companyId:number; companyName:string; locationId:number; locationName:string; scheduledDate:string; startTime:string|null; endTime:string|null; status:string};
  events: {scheduleId:number; companyId:number; companyName:string; scheduledDate:string; status:string}[];
  metrics: {totalEvents:Value;participatingVendors:Value;sellingVendors:Value;totalInvoices:Value;customerCheckouts:Value;unitsSold:Value;grossSales:Value;rewardPointsRedeemed:Value;netInvoicedAmount:Value;confirmedPayments:Value;outstandingPayments:Value;stockAvailable:Value};
  salesTrend:{date:string;grossSales:Value;netInvoicedAmount:Value}[];
  topVendors:{vendorId:number;vendorName:string;grossSales:Value;netInvoicedAmount:Value}[];
  recentInvoices:{invoiceId:number;invoiceNumber:string;issuedAt:string;netInvoicedAmount:Value;vendorName:string;scheduleId:number}[];
  stockAlerts:{assignmentId:number;scheduleId:number;productName:string;stockAvailable:Value}[];
  paymentSummary:{method:string;recipient:string;status:string;verification_source:string|null;amount:Value;count:Value}[];
}
export async function fetchDashboardSummary(filters:DashboardFilters):Promise<DashboardSummary> {
  return (await fleaMarketClient.get<{success:boolean;data:DashboardSummary}>('/dashboard/summary',{params:filters})).data.data;
}
