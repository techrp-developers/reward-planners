import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { FiArrowLeft, FiLock, FiMail, FiPhone, FiRefreshCw, FiSmartphone, FiX } from "react-icons/fi";
import {
  sendOtp,
  verifyOtp,
  reverify as reverifyOtp,
  getOtpErrorBody,
  type OtpChannel,
  type FleaMarketCustomer,
  type OtpSendResult,
  type OtpVerifyResult,
} from "../../api/fleaMarketOtpApi";
import { maskPhone, maskEmail } from "../../utils/mask";
import Avatar from "../ui/Avatar";
import Spinner from "../ui/Spinner";
import { ErrorState } from "../ui/EmptyState";
import Drawer from "../ui/Drawer";

/* ================= TYPES ================= */

interface VerifyIdentityModalProps {
  open: boolean;
  customer: FleaMarketCustomer;
  // Session-expiry recovery uses /customer/reverify instead of send-otp/verify-otp —
  // same OTP mechanics, different endpoint (see CustomerVerify's old isReverifyMode).
  isReverify?: boolean;
  reason?: string;
  onVerified: (customer: FleaMarketCustomer, sessionToken: string) => void;
  onCancel: () => void;
}

type Stage = "channel" | "otp";

const RESEND_COOLDOWN_SECONDS = 30;

const formatCountdown = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

function isVerifyResult(result: OtpSendResult | OtpVerifyResult): result is OtpVerifyResult {
  return "sessionToken" in result;
}

/* ================= COMPONENT ================= */
// Pops up whenever an already-picked-but-unverified customer needs to be
// OTP-proven — either the operator checked a redeem box (Cart requests
// verification) or an existing verified session expired mid-cart. Either way
// the customer is already known, so this only ever runs the channel+OTP
// stages, never the search stage (that lives in CustomerVerify).
function VerifyIdentityModal({ open, customer, isReverify = false, reason, onVerified, onCancel }: VerifyIdentityModalProps) {
  const [stage, setStage] = useState<Stage>("channel");
  const [channelError, setChannelError] = useState("");

  const [otpChannel, setOtpChannel] = useState<OtpChannel | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [resendCooldownUntil, setResendCooldownUntil] = useState<number | null>(null);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpLockedUntil, setOtpLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const otpInputRef = useRef<HTMLInputElement>(null);

  // Fresh stage/OTP state every time the popup opens for a (possibly new) customer.
  useEffect(() => {
    if (!open) return;
    setStage("channel");
    setChannelError("");
    setOtpChannel(null);
    setOtpExpiresAt(null);
    setResendCooldownUntil(null);
    setOtp("");
    setOtpError("");
    setOtpLockedUntil(null);
  }, [open, customer.userId]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (stage === "otp") {
      otpInputRef.current?.focus();
    }
  }, [stage]);

  const sendOtpMutation = useMutation({
    mutationFn: ({ channel }: { channel: OtpChannel }) =>
      isReverify ? reverifyOtp(customer.userId, channel) : sendOtp(customer.userId, channel),
  });

  const verifyOtpMutation = useMutation({
    mutationFn: ({ channel, code }: { channel: OtpChannel; code: string }) =>
      isReverify ? reverifyOtp(customer.userId, channel, code) : verifyOtp(customer.userId, code, channel),
  });

  const handleSendOtp = (channel: OtpChannel) => {
    setChannelError("");

    sendOtpMutation.mutate(
      { channel },
      {
        onSuccess: (result) => {
          // reverify() without an otp always resolves to the send-shape — same
          // cast CustomerVerify used to make before this file was split out.
          const sendResult = result as OtpSendResult;
          setOtpChannel(channel);
          setOtpExpiresAt(Date.now() + sendResult.expiresIn * 1000);
          setResendCooldownUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
          setOtp("");
          setOtpError("");
          setOtpLockedUntil(null);
          setStage("otp");
          toast.success(
            hasPhone && hasEmail
              ? "OTP sent via WhatsApp and email"
              : `OTP sent via ${hasPhone ? "WhatsApp" : "email"}`,
          );
        },
        onError: (error) => {
          console.error("Failed to send OTP:", error);
          const body = getOtpErrorBody(error);
          setChannelError(body?.message || "Unable to send OTP right now. Please try again.");
        },
      },
    );
  };

  const handleResendOtp = () => {
    if (!otpChannel) return;
    if (resendCooldownUntil && now < resendCooldownUntil) return;
    handleSendOtp(otpChannel);
  };

  const isLocked = otpLockedUntil !== null && now < otpLockedUntil;
  const isExpired = otpExpiresAt !== null && now > otpExpiresAt;

  const handleOtpChange = (value: string) => {
    setOtp(value.replace(/\D/g, "").slice(0, 4));
    if (otpError) setOtpError("");
  };

  const handleVerifyOtp = (e: FormEvent) => {
    e.preventDefault();

    if (isLocked || isExpired || !otpChannel) return;

    if (otp.length !== 4) {
      setOtpError("Enter the 4-digit OTP.");
      return;
    }

    setOtpError("");

    verifyOtpMutation.mutate(
      { channel: otpChannel, code: otp },
      {
        onSuccess: (result) => {
          if (!isVerifyResult(result)) {
            setOtpError("Unexpected response while verifying OTP.");
            return;
          }
          onVerified(result.customer, result.sessionToken);
        },
        onError: (error) => {
          console.error("Failed to verify OTP:", error);
          const body = getOtpErrorBody(error);

          if (body?.retryAfterSeconds) {
            setOtpLockedUntil(Date.now() + body.retryAfterSeconds * 1000);
          }
          setOtpError(body?.message || "Unable to verify OTP right now. Please try again.");
          setOtp("");
        },
      },
    );
  };

  const resendRemaining = resendCooldownUntil ? Math.max(0, Math.ceil((resendCooldownUntil - now) / 1000)) : 0;
  const expiryRemaining = otpExpiresAt ? Math.max(0, Math.ceil((otpExpiresAt - now) / 1000)) : 0;
  const lockRemaining = otpLockedUntil ? Math.max(0, Math.ceil((otpLockedUntil - now) / 1000)) : 0;

  const hasPhone = Boolean(customer.phone);
  const hasEmail = Boolean(customer.email);

  return (
    <Drawer open={open} title="Verify Customer" onClose={onCancel}>
      {reason && (
        <div className="flex items-center gap-2 p-3 mb-4 text-sm text-amber-700 border border-amber-200 rounded-xl bg-amber-50">
          {reason}
        </div>
      )}

      <div className="flex items-center gap-3 p-3 mb-4 border border-gray-100 rounded-xl">
        <Avatar name={customer.name} size="md" />
        <div>
          <p className="text-sm font-bold text-gray-800">{customer.name}</p>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
            {hasPhone && (
              <span className="flex items-center gap-1">
                <FiPhone className="w-3 h-3" />
                {maskPhone(customer.phone ?? "")}
              </span>
            )}
            {hasEmail && (
              <span className="flex items-center gap-1">
                <FiMail className="w-3 h-3" />
                {maskEmail(customer.email ?? "")}
              </span>
            )}
          </div>
        </div>
      </div>

      {stage === "channel" && (
        <>
          {channelError && <ErrorState className="mb-4" message={channelError} />}

          <div className="space-y-2">
            {(hasPhone || hasEmail) && (
              <button
                type="button"
                onClick={() => handleSendOtp(hasPhone ? "whatsapp" : "email")}
                disabled={sendOtpMutation.isPending}
                className="flex items-center justify-between w-full gap-3 p-3 text-left transition-colors border border-gray-100 rounded-xl hover:bg-gray-50 hover:border-purple-200 disabled:opacity-60"
              >
                <span className="flex items-center gap-3">
                  {hasPhone ? (
                    <FiSmartphone className="w-5 h-5 text-purple-600" />
                  ) : (
                    <FiMail className="w-5 h-5 text-purple-600" />
                  )}
                  <span>
                    <span className="block text-sm font-bold text-gray-800">
                      {hasPhone && hasEmail ? "Send OTP via WhatsApp & Email" : `Send OTP via ${hasPhone ? "WhatsApp" : "Email"}`}
                    </span>
                    <span className="block text-xs text-gray-400">
                      {[hasPhone ? maskPhone(customer.phone ?? "") : "", hasEmail ? maskEmail(customer.email ?? "") : ""]
                        .filter(Boolean)
                        .join(" • ")}
                    </span>
                  </span>
                </span>
                {sendOtpMutation.isPending && <Spinner />}
              </button>
            )}

            {!hasPhone && !hasEmail && (
              <p className="p-3 text-sm text-center text-gray-400">
                This customer has no phone or email on file to verify against.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1.5 mt-4 text-sm font-bold text-gray-500 hover:text-gray-700"
          >
            <FiArrowLeft className="w-4 h-4" />
            Cancel
          </button>
        </>
      )}

      {stage === "otp" && otpChannel && (
        <>
          {isLocked ? (
            <div className="flex items-center gap-3 p-4 text-sm text-red-700 border border-red-200 rounded-xl bg-red-50">
              <FiLock className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-bold">Too many incorrect attempts</p>
                <p className="mt-0.5 text-xs">Try again in {formatCountdown(lockRemaining)}.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleVerifyOtp}>
              <div
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl bg-white
                border border-slate-200 shadow-sm transition-all duration-300
                focus-within:border-transparent focus-within:ring-4 focus-within:ring-[#852BAF]/15"
              >
                <FiSmartphone className="w-5 h-5 text-gray-400 shrink-0" />
                <input
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => handleOtpChange(e.target.value)}
                  placeholder="Enter 4-digit OTP"
                  className="w-full text-lg tracking-[0.4em] text-gray-800 bg-transparent outline-none placeholder:tracking-normal placeholder:text-gray-400"
                />
                {otp && (
                  <button
                    type="button"
                    onClick={() => handleOtpChange("")}
                    className="text-gray-400 hover:text-gray-600 shrink-0"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                )}
              </div>

              {otpError && <ErrorState className="mt-3" message={otpError} />}

              {isExpired && !otpError && (
                <div className="flex items-center gap-2 p-3 mt-3 text-sm text-amber-700 border border-amber-200 rounded-xl bg-amber-50">
                  This OTP has expired. Please resend a new one.
                </div>
              )}

              <div className="flex items-center justify-between gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setStage("channel")}
                  className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700"
                >
                  <FiArrowLeft className="w-4 h-4" />
                  Change Channel
                </button>

                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendRemaining > 0 || sendOtpMutation.isPending}
                  className="flex items-center gap-1.5 text-sm font-bold text-purple-600 hover:text-purple-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <FiRefreshCw className={`w-4 h-4 ${sendOtpMutation.isPending ? "animate-spin" : ""}`} />
                  {resendRemaining > 0 ? `Resend OTP (${resendRemaining}s)` : "Resend OTP"}
                </button>
              </div>

              {!isExpired && (
                <p className="mt-2 text-[11px] text-gray-400">Expires in {formatCountdown(expiryRemaining)}</p>
              )}

              <button
                type="submit"
                disabled={verifyOtpMutation.isPending || otp.length !== 4 || isExpired}
                className="w-full py-2.5 mt-4 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {verifyOtpMutation.isPending ? "Verifying..." : "Verify & Continue"}
              </button>
            </form>
          )}

          {isLocked && (
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-1.5 mt-4 text-sm font-bold text-gray-500 hover:text-gray-700"
            >
              <FiArrowLeft className="w-4 h-4" />
              Cancel
            </button>
          )}
        </>
      )}
    </Drawer>
  );
}

export default VerifyIdentityModal;
