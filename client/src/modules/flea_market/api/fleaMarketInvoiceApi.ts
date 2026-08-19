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

export async function downloadInvoicePdf(invoiceId: number, invoiceNumber: string): Promise<void> {
  const response = await fleaMarketClient.get<Blob>(`/invoices/${invoiceId}/pdf`, { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${invoiceNumber}.pdf`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function emailInvoice(invoiceId: number): Promise<string> {
  const { data } = await fleaMarketClient.post<{ success: true; message: string }>(`/invoices/${invoiceId}/email`);
  return data.message;
}
