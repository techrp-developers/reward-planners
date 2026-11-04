import axios from "axios";
import { fleaMarketClient } from "./fleaMarketClient";

/* ================= TYPES ================= */

export interface CheckoutItemInput {
  variantId: number;
  qty: number;
  pointsApplied: number;
}

export interface CheckoutInvoiceSummary {
  invoiceId: number;
  invoiceNumber: string;
  vendorId: number;
  subtotal: number;
  pointsRedeemed: number;
  amountPaid: number;
}

export interface CheckoutPayment {method:"cash"|"card"|"upi";amount:string;reference:string;confirmed:boolean}
export interface CheckoutResult {
  checkoutId?: string;
  invoices: CheckoutInvoiceSummary[];
  totalPointsRedeemed: number;
  totalAmountPaid: number;
  newWalletBalance: number;
}

interface CheckoutApiResponse {
  success: boolean;
  data: CheckoutResult;
}

// Body shape of a non-2xx response from POST /checkout.
export interface FleaMarketCheckoutErrorBody {
  success: false;
  message: string;
  available?: number; // INSUFFICIENT_POINTS
  variantId?: number; // OUT_OF_STOCK / PRODUCT_NOT_FOUND
}

export function getCheckoutErrorBody(error: unknown): FleaMarketCheckoutErrorBody | null {
  if (axios.isAxiosError(error) && error.response?.data) {
    return error.response.data as FleaMarketCheckoutErrorBody;
  }
  return null;
}

/* ================= CALLS ================= */
// Cart is split server-side into one invoice per vendor — the same
// idempotencyKey must be reused on retry so the backend's dedupe actually works.

export async function checkout(items: CheckoutItemInput[], idempotencyKey: string, scheduleId:number, payment:CheckoutPayment): Promise<CheckoutResult> {
  const { data } = await fleaMarketClient.post<CheckoutApiResponse>(
    "/checkout",
    { items, scheduleId, payment },
    { headers: { "Idempotency-Key": idempotencyKey } },
  );
  return data.data;
}

export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

export async function canStartNewAttempt(key:string):Promise<boolean> {
  const {data}=await fleaMarketClient.get<{data:{status:string}}>(`/checkout/${encodeURIComponent(key)}/status`);
  return ['failed','not_started','not_found'].includes(data.data.status);
}
