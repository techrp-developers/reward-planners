import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AxiosError } from "axios";
import { useAuth } from "./useAuth";

const FullScreenLoader = ({ text }: { text: string }) => (
  <div
    className="min-h-screen flex items-center justify-center
                  bg-gradient-to-tr from-[#38bdf8] via-[#a855f7] to-[#ec4899]"
  >
    <div className="bg-white px-8 py-6 rounded-2xl shadow-xl text-center">
      <div
        className="animate-spin h-8 w-8 mx-auto mb-3 rounded-full
                      border-4 border-[#852BAF] border-t-transparent"
      />
      <p className="text-sm font-semibold text-gray-600">{text}</p>
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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const storedEmail =
      location.state?.email || sessionStorage.getItem("otp_email");

    if (!storedEmail) {
      navigate("/register", { replace: true });
      return;
    }

    setEmail(storedEmail);
  }, [navigate]);

  useEffect(() => {
    if (otp.length === 6 && email) {
      verifyOtp(email, otp);
    }
  }, [otp]);

  useEffect(() => {
    if (!loading && email) {
      setMounted(true);
    }
  }, [loading, email]);

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

    if (otp.length !== 6) {
      setLocalError("Enter valid 6-digit OTP");
      return;
    }

    try {
      await verifyOtp(email!, otp.trim());
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
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || !email) return;

    try {
      await resendOtp(email);
      setCooldown(30);
    } catch (err: unknown) {
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
    <div
      className={`
    transition-all duration-500 ease-out
    ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
  `}
    >
      <div className="min-h-screen overflow-hidden flex items-center justify-center bg-gradient-to-tr from-[#38bdf8] via-[#a855f7] to-[#ec4899] px-4">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-white/40 overflow-hidden">
          {/* Premium Top Strip */}
          <div className="px-8 pt-8 pb-6 bg-[radial-gradient(900px_circle_at_15%_20%,rgba(56,189,248,0.15),transparent_55%),radial-gradient(900px_circle_at_85%_30%,rgba(168,85,247,0.12),transparent_55%),radial-gradient(900px_circle_at_50%_110%,rgba(236,72,153,0.10),transparent_55%)] border-b border-gray-100">
            <h2 className="text-2xl font-extrabold text-gray-900 text-center">
              Verify OTP
            </h2>
            <p className="mt-2 text-sm text-gray-600 text-center">
              Enter the 6-digit code sent to{" "}
              <span className="font-semibold text-gray-900">
                {email ? maskEmail(email) : "your email"}
              </span>
            </p>
          </div>

          <div className="px-8 py-7">
            {(localError || error) && (
              <div className="mb-4 p-3 text-sm text-red-700 border-l-4 border-red-500 rounded-xl bg-red-50">
                {localError || error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* OTP Input */}
              <div>
                <label className="block text-[11px] font-bold tracking-widest text-slate-600 uppercase">
                  OTP Code
                </label>

                <div className="relative group mt-2">
                  <div
                    className="pointer-events-none absolute -inset-0.5 rounded-2xl opacity-0 blur-lg transition duration-300
                             bg-gradient-to-r from-[#852BAF]/25 to-[#FC3F78]/25
                             group-focus-within:opacity-100"
                  />
                  <input
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => {
                      setLocalError("");
                      setOtp(e.target.value.replace(/\D/g, ""));
                    }}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="relative w-full px-4 py-2.5 rounded-2xl bg-white/90
                             text-slate-900 placeholder:text-slate-400
                             border border-slate-200 shadow-sm
                             outline-none transition-all duration-300
                             focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15
                             focus:shadow-lg focus:shadow-[#852BAF]/10
                             text-center tracking-[0.35em] md:tracking-[0.5em]"
                    placeholder="••••••"
                    autoFocus
                  />
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full text-white font-bold py-3 rounded-full text-base
                         bg-gradient-to-r from-[#852BAF] to-[#FC3F78]
                         shadow-lg shadow-[#852BAF]/25 transition-all duration-300 cursor-pointer
                         hover:bg-gradient-to-r hover:from-[#FC3F78] hover:to-[#852BAF]
                         hover:shadow-xl active:scale-95
                         disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Verifying..." : "Verify OTP"}
              </button>
            </form>

            {/* Resend */}
            <div className="text-center mt-5">
              <button
                onClick={handleResend}
                disabled={cooldown > 0}
                className="text-sm font-semibold text-[#852BAF] hover:text-[#FC3F78] transition-all hover:underline disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                type="button"
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend OTP"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
