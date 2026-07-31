import axios from "axios";
import { fleaMarketClient } from "./fleaMarketClient";

/* ================= TYPES ================= */

export type OtpChannel = "sms" | "email";

// The fully-verified customer, as returned by verify-otp/reverify — includes
// the wallet balance, which isn't known until this point (see
// FleaMarketCustomerSearchResult in fleaMarketUsersApi.ts for the pre-verify shape).
export interface FleaMarketCustomer {
  userId: number;
  name: string;
  phone: string | null;
  email: string | null;
  walletBalance: number;
}

export interface OtpSendResult {
  otpSessionId: string;
  expiresIn: number;
}

export interface OtpVerifyResult {
  sessionToken: string;
  customer: FleaMarketCustomer;
}

interface SendOtpApiResponse {
  success: true;
  data: OtpSendResult;
}

interface VerifyOtpApiResponse {
  success: true;
  data: OtpVerifyResult;
}

// Same shape as verify-otp's result — a session token either way, just one
// with otp_verified_at set and one without (see SelectCustomerResult).
export type SelectCustomerResult = OtpVerifyResult;

interface SelectCustomerApiResponse {
  success: true;
  data: SelectCustomerResult;
}

// Body shape of a non-2xx response from any of the OTP endpoints (400/423/429).
export interface FleaMarketOtpErrorBody {
  success: false;
  message: string;
  retryAfterSeconds?: number;
  attemptsRemaining?: number;
}

// Narrows an unknown catch value down to the OTP error body, if that's what it is.
export function getOtpErrorBody(error: unknown): FleaMarketOtpErrorBody | null {
  if (axios.isAxiosError(error) && error.response?.data) {
    return error.response.data as FleaMarketOtpErrorBody;
  }
  return null;
}

/* ================= CALLS ================= */

// Picks a customer from search without requiring OTP — enough to build a cart
// and attribute the eventual invoice, not enough to redeem reward points
// (checkoutService rejects redemption unless the session came from verifyOtp).
export async function selectCustomer(userId: number): Promise<SelectCustomerResult> {
  const { data } = await fleaMarketClient.post<SelectCustomerApiResponse>("/customer/select", { userId });
  return data.data;
}

export async function sendOtp(userId: number, channel: OtpChannel): Promise<OtpSendResult> {
  const { data } = await fleaMarketClient.post<SendOtpApiResponse>("/customer/send-otp", {
    userId,
    channel,
  });
  return data.data;
}

export async function verifyOtp(userId: number, otp: string, channel: OtpChannel): Promise<OtpVerifyResult> {
  const { data } = await fleaMarketClient.post<VerifyOtpApiResponse>("/customer/verify-otp", {
    userId,
    otp,
    channel,
  });
  return data.data;
}

// Session-expiry recovery path — same OTP flow (send when no otp given, verify when it is).
export async function reverify(
  userId: number,
  channel: OtpChannel,
  otp?: string,
): Promise<OtpSendResult | OtpVerifyResult> {
  const { data } = await fleaMarketClient.post<SendOtpApiResponse | VerifyOtpApiResponse>("/customer/reverify", {
    userId,
    channel,
    ...(otp ? { otp } : {}),
  });
  return data.data;
}
