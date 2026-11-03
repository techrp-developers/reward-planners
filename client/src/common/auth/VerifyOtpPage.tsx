import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AxiosError } from "axios";
import { useAuth } from "./useAuth";
import AuthShell from "./AuthShell";

const FullScreenLoader = ({ text }: { text: string }) => (
  <div className="flex min-h-screen items-center justify-center bg-[#f8f6fb]">
    <div className="flex items-center gap-3 text-sm text-slate-600">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#852BAF] border-t-transparent" />
      {text}
    </div>
  </div>
);

const maskEmail = (email: string) => {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 3)}***@${domain}`;
};

export default function VerifyOtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { verifyOtp, resendOtp, loading, error } = useAuth();

  const [otp, setOtp] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [localError, setLocalError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const verificationInFlight = useRef(false);

  useEffect(() => {
    const storedEmail =
      location.state?.email || sessionStorage.getItem("otp_email");

    if (!storedEmail) {
      navigate("/register", { replace: true });
      return;
    }

    setEmail(storedEmail);
  }, [location.state, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = setInterval(() => {
      setCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError("");

    const normalizedOtp = otp.trim();
    if (!email || !/^\d{6}$/.test(normalizedOtp)) {
      setLocalError("Enter valid 6-digit OTP");
      return;
    }

    // The OTP is single-use. Guard against a double-click/Enter submitting it
    // twice before React has had time to update the shared loading state.
    if (verificationInFlight.current) return;
    verificationInFlight.current = true;

    try {
      await verifyOtp(email, normalizedOtp);
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        setLocalError(
          err.response?.data?.message ?? err.message ?? "OTP failed",
        );
      } else if (err instanceof Error) {
        setLocalError(err.message);
      } else {
        setLocalError("OTP failed");
      }
    } finally {
      verificationInFlight.current = false;
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || !email) return;

    try {
      await resendOtp(email);
      setCooldown(30);
    } catch {
      setLocalError("Failed to resend OTP");
    }
  };

  if (loading) {
    return <FullScreenLoader text="Verifying your OTP..." />;
  }

  if (email === null) {
    return <FullScreenLoader text="Preparing verification..." />;
  }

  return (
    <AuthShell
      title="Verify your email"
      description={<>Enter the 6-digit code sent to <span className="font-medium text-slate-900">{maskEmail(email)}</span>.</>}
    >
      {(localError || error) && (
        <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {localError || error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="otp" className="mb-2 block text-sm font-semibold text-slate-700">Verification code</label>
          <input
            id="otp"
            type="text"
            maxLength={6}
            value={otp}
            onChange={(e) => {
              setLocalError("");
              setOtp(e.target.value.replace(/\D/g, ""));
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            autoFocus
            className="h-12 w-full rounded-lg border border-gray-300 bg-white px-4 text-center text-lg tracking-[0.5em] text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-[#852BAF] focus:ring-2 focus:ring-[#852BAF]/15"
          />
        </div>

        <button
          type="submit"
          disabled={loading || otp.length !== 6}
          className="flex h-11 w-full items-center justify-center rounded-lg bg-[#180d26] px-5 text-sm font-semibold text-white transition hover:bg-[#2e1a47] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {loading ? "Verifying..." : "Verify"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">
        Didn't get the code?{" "}
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0}
          className="font-semibold text-[#852BAF] hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </p>
    </AuthShell>
  );
}
