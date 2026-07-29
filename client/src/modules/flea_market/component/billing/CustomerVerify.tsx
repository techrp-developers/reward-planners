import { memo, useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FiSearch,
  FiX,
  FiUser,
  FiPhone,
  FiMail,
  FiShield,
  FiSmartphone,
  FiArrowLeft,
  FiRefreshCw,
  FiLock,
} from "react-icons/fi";
import { useDebounce } from "../../../../common/hooks/useDebounce";
import { searchFleaMarketCustomers, type FleaMarketCustomerSearchResult } from "../../api/fleaMarketUsersApi";
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
import SectionCard from "../ui/SectionCard";
import Avatar from "../ui/Avatar";
import Spinner from "../ui/Spinner";
import { ErrorState } from "../ui/EmptyState";

/* ================= TYPES ================= */

// Either a fresh search result (pre-verify, no wallet balance yet) or the
// previously-verified customer being re-verified after session expiry —
// the channel/otp stages only ever touch the fields both shapes share.
type SelectableCustomer = FleaMarketCustomerSearchResult | FleaMarketCustomer;

interface CustomerVerifyProps {
  // Scopes customer search to the company selected on SchedulePage — carried
  // through BillingPage's router state, not read from any env config.
  companyId: number;
  onVerified: (customer: FleaMarketCustomer, sessionToken: string) => void;
  // When set, skip search and go straight to re-verifying this customer —
  // used when a session token has expired mid-cart.
  reverifyCustomer?: FleaMarketCustomer | null;
  reverifyReason?: string;
  onCancelReverify?: () => void;
}

type Stage = "search" | "channel" | "otp";

const MIN_SEARCH_LENGTH = 3;
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

function CustomerVerify({
  companyId,
  onVerified,
  reverifyCustomer = null,
  reverifyReason,
  onCancelReverify,
}: CustomerVerifyProps) {
  const isReverifyMode = Boolean(reverifyCustomer);

  const [search, setSearch] = useState("");
  const debouncedUserSearch = useDebounce(search, 400);
  const trimmedSearch = debouncedUserSearch.trim();
  const searchEnabled = trimmedSearch.length >= MIN_SEARCH_LENGTH;

  const [highlightedIndex, setHighlightedIndex] = useState(0);

  /* ---- verification stage ---- */
  const [stage, setStage] = useState<Stage>(reverifyCustomer ? "channel" : "search");
  const [selectedCustomer, setSelectedCustomer] = useState<SelectableCustomer | null>(reverifyCustomer);
  const [channelError, setChannelError] = useState("");

  const [otpChannel, setOtpChannel] = useState<OtpChannel | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [resendCooldownUntil, setResendCooldownUntil] = useState<number | null>(null);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpLockedUntil, setOtpLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  const otpInputRef = useRef<HTMLInputElement>(null);

  /* ================= TICKING CLOCK (resend / lock / expiry countdowns) ================= */
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /* ================= SEARCH EXISTING CUSTOMERS ================= */
  const {
    data: users = [],
    isFetching: usersLoading,
    error: usersError,
    refetch: retryUsersSearch,
  } = useQuery({
    queryKey: ["flea-market", "customers", "search", companyId, trimmedSearch],
    queryFn: () => searchFleaMarketCustomers(companyId, trimmedSearch),
    enabled: searchEnabled,
  });

  useEffect(() => {
    setHighlightedIndex(0);
  }, [trimmedSearch]);

  /* ================= AUTO-FOCUS OTP INPUT ================= */
  useEffect(() => {
    if (stage === "otp") {
      otpInputRef.current?.focus();
    }
  }, [stage]);

  /* ================= MUTATIONS: OTP SEND / VERIFY ================= */

  const sendOtpMutation = useMutation({
    mutationFn: ({ customer, channel }: { customer: SelectableCustomer; channel: OtpChannel }) =>
      isReverifyMode ? reverifyOtp(customer.userId, channel) : sendOtp(customer.userId, channel),
  });

  const verifyOtpMutation = useMutation({
    mutationFn: ({ customer, channel, code }: { customer: SelectableCustomer; channel: OtpChannel; code: string }) =>
      isReverifyMode ? reverifyOtp(customer.userId, channel, code) : verifyOtp(customer.userId, code, channel),
  });

  /* ================= HANDLERS: CUSTOMER SELECTION ================= */

  const resetOtpState = () => {
    setOtpChannel(null);
    setOtpExpiresAt(null);
    setResendCooldownUntil(null);
    setOtp("");
    setOtpError("");
    setOtpLockedUntil(null);
    setChannelError("");
  };

  // Selecting a customer (mouse or keyboard) does NOT confirm them yet — it
  // moves to channel selection so OTP verification can run first.
  const beginVerification = (customer: FleaMarketCustomerSearchResult) => {
    resetOtpState();
    setSelectedCustomer(customer);
    setStage("channel");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (users.length === 0) return;
      setHighlightedIndex((prev) => (prev + 1) % users.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (users.length === 0) return;
      setHighlightedIndex((prev) => (prev - 1 + users.length) % users.length);
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (users.length === 0) return;

      const user = users[highlightedIndex] ?? users[0];
      beginVerification(user);
      return;
    }

    if (e.key === "Escape") {
      setSearch("");
    }
  };

  const showNoResults = !usersLoading && !usersError && searchEnabled && users.length === 0;

  /* ================= HANDLERS: OTP ================= */

  const handleChangeCustomer = () => {
    if (reverifyCustomer && onCancelReverify) {
      onCancelReverify();
    }
    setSelectedCustomer(null);
    setStage("search");
    setSearch("");
    resetOtpState();
  };

  const applySendResult = (result: OtpSendResult, channel: OtpChannel) => {
    setOtpChannel(channel);
    setOtpExpiresAt(Date.now() + result.expiresIn * 1000);
    setResendCooldownUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
    setOtp("");
    setOtpError("");
    setOtpLockedUntil(null);
    setStage("otp");
  };

  const handleSendOtp = (customer: SelectableCustomer, channel: OtpChannel) => {
    setChannelError("");

    sendOtpMutation.mutate(
      { customer, channel },
      {
        onSuccess: (result) => {
          applySendResult(result as OtpSendResult, channel);
          toast.success(`OTP sent via ${channel === "sms" ? "SMS" : "email"}`);
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
    if (!selectedCustomer || !otpChannel) return;
    if (resendCooldownUntil && now < resendCooldownUntil) return;
    handleSendOtp(selectedCustomer, otpChannel);
  };

  const isLocked = otpLockedUntil !== null && now < otpLockedUntil;
  const isExpired = otpExpiresAt !== null && now > otpExpiresAt;

  const handleOtpChange = (value: string) => {
    setOtp(value.replace(/\D/g, "").slice(0, 6));
    if (otpError) setOtpError("");
  };

  const handleVerifyOtp = (e: FormEvent) => {
    e.preventDefault();

    if (isLocked || isExpired || !selectedCustomer || !otpChannel) return;

    if (otp.length !== 6) {
      setOtpError("Enter the 6-digit OTP.");
      return;
    }

    setOtpError("");

    verifyOtpMutation.mutate(
      { customer: selectedCustomer, channel: otpChannel, code: otp },
      {
        onSuccess: (result) => {
          if (!isVerifyResult(result)) {
            // Defensive — reverify should only take this branch when `otp` is passed.
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

  /* ================= RENDER: OTP STAGE ================= */

  if (stage === "otp" && selectedCustomer && otpChannel) {
    const destination =
      otpChannel === "sms" ? maskPhone(selectedCustomer.phone ?? "") : maskEmail(selectedCustomer.email ?? "");

    return (
      <SectionCard
        icon={FiShield}
        title="Verify OTP"
        subtitle={`Sent a 6-digit code to ${destination} for ${selectedCustomer.name}.`}
      >
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
                placeholder="Enter 6-digit OTP"
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
                onClick={handleChangeCustomer}
                className="flex items-center gap-1.5 text-sm font-bold text-gray-500 hover:text-gray-700"
              >
                <FiArrowLeft className="w-4 h-4" />
                Change Customer
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
              disabled={verifyOtpMutation.isPending || otp.length !== 6 || isExpired}
              className="w-full py-2.5 mt-4 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {verifyOtpMutation.isPending ? "Verifying..." : "Verify & Continue"}
            </button>
          </form>
        )}

        {isLocked && (
          <button
            type="button"
            onClick={handleChangeCustomer}
            className="flex items-center gap-1.5 mt-4 text-sm font-bold text-gray-500 hover:text-gray-700"
          >
            <FiArrowLeft className="w-4 h-4" />
            Change Customer
          </button>
        )}
      </SectionCard>
    );
  }

  /* ================= RENDER: CHANNEL STAGE ================= */

  if (stage === "channel" && selectedCustomer) {
    const hasPhone = Boolean(selectedCustomer.phone);
    const hasEmail = Boolean(selectedCustomer.email);

    return (
      <SectionCard icon={FiShield} title="Verify Customer" subtitle={`Choose where to send the OTP for ${selectedCustomer.name}.`}>
        {reverifyReason && (
          <div className="flex items-center gap-2 p-3 mb-4 text-sm text-amber-700 border border-amber-200 rounded-xl bg-amber-50">
            {reverifyReason}
          </div>
        )}

        <div className="flex items-center gap-3 p-3 mb-4 border border-gray-100 rounded-xl">
          <Avatar name={selectedCustomer.name} size="md" />
          <div>
            <p className="text-sm font-bold text-gray-800">{selectedCustomer.name}</p>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
              {hasPhone && (
                <span className="flex items-center gap-1">
                  <FiPhone className="w-3 h-3" />
                  {maskPhone(selectedCustomer.phone ?? "")}
                </span>
              )}
              {hasEmail && (
                <span className="flex items-center gap-1">
                  <FiMail className="w-3 h-3" />
                  {maskEmail(selectedCustomer.email ?? "")}
                </span>
              )}
            </div>
          </div>
        </div>

        {channelError && <ErrorState className="mb-4" message={channelError} />}

        <div className="space-y-2">
          {hasPhone && (
            <button
              type="button"
              onClick={() => handleSendOtp(selectedCustomer, "sms")}
              disabled={sendOtpMutation.isPending}
              className="flex items-center justify-between w-full gap-3 p-3 text-left transition-colors border border-gray-100 rounded-xl hover:bg-gray-50 hover:border-purple-200 disabled:opacity-60"
            >
              <span className="flex items-center gap-3">
                <FiSmartphone className="w-5 h-5 text-purple-600" />
                <span>
                  <span className="block text-sm font-bold text-gray-800">Send OTP via SMS</span>
                  <span className="block text-xs text-gray-400">{maskPhone(selectedCustomer.phone ?? "")}</span>
                </span>
              </span>
              {sendOtpMutation.isPending && sendOtpMutation.variables?.channel === "sms" && <Spinner />}
            </button>
          )}

          {hasEmail && (
            <button
              type="button"
              onClick={() => handleSendOtp(selectedCustomer, "email")}
              disabled={sendOtpMutation.isPending}
              className="flex items-center justify-between w-full gap-3 p-3 text-left transition-colors border border-gray-100 rounded-xl hover:bg-gray-50 hover:border-purple-200 disabled:opacity-60"
            >
              <span className="flex items-center gap-3">
                <FiMail className="w-5 h-5 text-purple-600" />
                <span>
                  <span className="block text-sm font-bold text-gray-800">Send OTP via Email</span>
                  <span className="block text-xs text-gray-400">{maskEmail(selectedCustomer.email ?? "")}</span>
                </span>
              </span>
              {sendOtpMutation.isPending && sendOtpMutation.variables?.channel === "email" && <Spinner />}
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
          onClick={handleChangeCustomer}
          className="flex items-center gap-1.5 mt-4 text-sm font-bold text-gray-500 hover:text-gray-700"
        >
          <FiArrowLeft className="w-4 h-4" />
          Change Customer
        </button>
      </SectionCard>
    );
  }

  /* ================= RENDER: SEARCH STAGE ================= */

  return (
    <SectionCard icon={FiUser} title="Customer Check" subtitle="Search by name, mobile number or email to find a customer.">
      {/* Search Field */}
      <div
        className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl bg-white
        border border-slate-200 shadow-sm transition-all duration-300
        focus-within:border-transparent focus-within:ring-4 focus-within:ring-[#852BAF]/15"
      >
        <FiSearch className="w-5 h-5 text-gray-400 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by name, mobile number or email"
          className="w-full text-gray-800 bg-transparent outline-none placeholder:text-gray-400"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600 shrink-0">
            <FiX className="w-4 h-4" />
          </button>
        )}
      </div>

      {search.trim().length > 0 && search.trim().length < MIN_SEARCH_LENGTH && (
        <p className="mt-2 text-xs text-gray-400">Type at least {MIN_SEARCH_LENGTH} characters to search.</p>
      )}

      {users.length > 0 && <p className="mt-2 text-xs text-gray-400">Use ↑ ↓ to navigate, Enter to select.</p>}

      {/* Results */}
      <div className="mt-4 space-y-2">
        {usersLoading && (
          <div className="py-6">
            <Spinner label="Searching customers..." />
          </div>
        )}

        {!usersLoading && usersError && (
          <ErrorState message="Unable to load customers right now." onRetry={() => void retryUsersSearch()} />
        )}

        {!usersLoading &&
          !usersError &&
          users.map((user, index) => {
            const isHighlighted = index === highlightedIndex;

            return (
              <button
                key={user.userId}
                type="button"
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => beginVerification(user)}
                className={`flex items-center justify-between w-full gap-4 p-3 text-left transition-colors border rounded-xl ${
                  isHighlighted
                    ? "bg-gradient-to-r from-[#852BAF]/10 to-[#FC3F78]/10 border-purple-200"
                    : "border-gray-100 hover:bg-gray-50 hover:border-purple-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar name={user.name} />
                  <div>
                    <p className="text-sm font-bold text-gray-800">{user.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                      {user.phone && (
                        <span className="flex items-center gap-1">
                          <FiPhone className="w-3 h-3" />
                          {user.phone}
                        </span>
                      )}
                      {user.email && (
                        <span className="flex items-center gap-1">
                          <FiMail className="w-3 h-3" />
                          {user.email}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}

        {showNoResults && (
          <p className="py-6 text-sm text-center text-gray-500">No customer found for "{trimmedSearch}".</p>
        )}
      </div>
    </SectionCard>
  );
}

export default memo(CustomerVerify);
