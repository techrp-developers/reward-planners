import { fleaMarketClient } from "./fleaMarketClient";

export interface InvoiceLineItem {
  productId: number;
  variantId: number;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface InvoiceDetail {
  invoiceId: number;
  invoiceNumber: string;
  orderId: number;
  vendorId: number;
  status: string;
  issuedAt: string;
  locationId: number | null;
  companyName: string | null;
  companyLogoUrl: string | null;
  vendorName: string | null;
  subtotal: number;
  pointsRedeemed: number;
  amountPaid: number;
  items: InvoiceLineItem[];
}

interface InvoiceApiResponse {
  success: boolean;
  data: InvoiceDetail;
}

// The checkout response only returns per-invoice totals — full itemized detail
// (product names, sku, line totals) comes from this endpoint, one call per
// invoice in the batch.
export async function fetchInvoice(invoiceId: number): Promise<InvoiceDetail> {
  const { data } = await fleaMarketClient.get<InvoiceApiResponse>(`/invoices/${invoiceId}`);
  return data.data;
}
