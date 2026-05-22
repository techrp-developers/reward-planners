import { useSearchParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { api } from "../api/api";
import { LoaderCircle, Lock, Eye, EyeOff, ShieldAlert, ArrowLeft } from "lucide-react";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Guard: invalid or missing token
  if (!token) {
    return (
      <div className="min-h-screen overflow-hidden flex items-center justify-center bg-gradient-to-tr from-[#38bdf8] via-[#a855f7] to-[#ec4899] px-4">
        <div className="w-full max-w-md">
          <div className="relative rounded-3xl p-[1px] bg-gradient-to-r from-white/40 via-white/10 to-white/40 shadow-2xl">
            <div className="relative rounded-3xl bg-white/95 backdrop-blur-xl p-8 shadow-xl border border-white/30 overflow-hidden text-center">
              <div className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-[#38bdf8]/20 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-28 -left-28 h-64 w-64 rounded-full bg-[#ec4899]/15 blur-2xl" />
              <div className="pointer-events-none absolute inset-0 opacity-[0.06] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:18px_18px]" />

              <div className="relative mx-auto mb-4 h-12 w-12 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
                <ShieldAlert className="text-red-600" size={22} />
              </div>

              <h2 className="relative text-xl font-extrabold text-red-700">
                Invalid or Expired Link
              </h2>

              <p className="relative mt-3 text-sm text-slate-600">
                The password reset link is invalid or has expired. Please request a new password reset.
              </p>

              <div className="relative mt-6 flex justify-center">
                <button
                  onClick={() => (window.location.href = "https://rewardplanners.com/crm/login")}
                  className="px-6 py-3 rounded-2xl font-bold text-white
                           bg-gradient-to-r from-[#852BAF] to-[#FC3F78]
                           shadow-lg shadow-[#852BAF]/25
                           transition-all duration-300 cursor-pointer
                           hover:from-[#FC3F78] hover:to-[#852BAF]
                           active:scale-95"
                >
                  Go to Login
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!password || !confirmPassword) {
      setError("All fields are required.");
      return;
    }

    if (password.length < 5) {
      setError("Password must be at least 5 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      const res = await api.post("/auth/reset-password", {
        token,
        password,
        confirmPassword,
      });

      if (!res.data?.success) {
        throw new Error(res.data?.message || "Password reset failed");
      }

      setSuccess("Password reset successfully. Redirecting to login...");
      setTimeout(() => navigate("/login"), 1500);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden flex items-center justify-center bg-gradient-to-tr from-[#38bdf8] via-[#a855f7] to-[#ec4899] px-4">
      <div className="w-full max-w-lg">
        <div className="relative rounded-3xl p-[1px] bg-gradient-to-r from-white/40 via-white/10 to-white/40 shadow-2xl">
          <div className="relative rounded-3xl bg-white/95 backdrop-blur-xl px-8 py-8 shadow-xl overflow-hidden">
            {/* premium blobs */}
            <div className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-[#38bdf8]/20 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-28 -left-28 h-64 w-64 rounded-full bg-[#ec4899]/15 blur-2xl" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.06] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:18px_18px]" />

            {/* Header */}
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition cursor-pointer"
                >
                  <ArrowLeft size={16} />
                  Back to Login
                </button>

                <h1 className="mt-4 text-2xl font-extrabold text-slate-900">
                  Reset Password
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                  Enter a new password for your account.
                </p>
              </div>

              <div className="h-10 w-10 rounded-2xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] shadow-md shadow-[#852BAF]/20 flex items-center justify-center shrink-0">
                <Lock className="text-white" size={18} />
              </div>
            </div>

            {/* Alerts */}
            {error && (
              <div className="relative mt-5 p-3 rounded-2xl bg-red-50 text-red-700 border border-red-200 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="relative mt-5 p-3 rounded-2xl bg-green-50 text-green-700 border border-green-200 text-sm">
                {success}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="relative mt-6 space-y-4">
<div>
  <label className="block text-[11px] font-bold tracking-widest text-slate-600 uppercase">
    New Password
  </label>

  <div className="relative group mt-2">
    <div
      className="pointer-events-none absolute -inset-0.5 rounded-2xl opacity-0 blur-lg transition duration-300
                 bg-gradient-to-r from-[#852BAF]/25 to-[#FC3F78]/25
                 group-focus-within:opacity-100"
    />
    <Lock
      className="absolute left-4 top-3.5 text-slate-400 pointer-events-none"
      size={18}
    />

    <input
      type={showPassword ? "text" : "password"}
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      className="relative w-full pl-11 pr-10 py-3 rounded-2xl bg-white/90 text-slate-900 placeholder:text-slate-400
                 border border-slate-200 shadow-sm outline-none transition-all duration-300
                 focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15
                 focus:shadow-lg focus:shadow-[#852BAF]/10"
      placeholder="Enter new password"
      autoComplete="new-password"
    />

    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
    >
      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  </div>
</div>

<div className="mt-4">
  <label className="block text-[11px] font-bold tracking-widest text-slate-600 uppercase">
    Confirm New Password
  </label>

  <div className="relative group mt-2">
    <div
      className="pointer-events-none absolute -inset-0.5 rounded-2xl opacity-0 blur-lg transition duration-300
                 bg-gradient-to-r from-[#852BAF]/25 to-[#FC3F78]/25
                 group-focus-within:opacity-100"
    />
    <Lock
      className="absolute left-4 top-3.5 text-slate-400 pointer-events-none"
      size={18}
    />

    <input
      type={showConfirmPassword ? "text" : "password"}
      value={confirmPassword}
      onChange={(e) => setConfirmPassword(e.target.value)}
      className="relative w-full pl-11 pr-10 py-3 rounded-2xl bg-white/90 text-slate-900 placeholder:text-slate-400
                 border border-slate-200 shadow-sm outline-none transition-all duration-300
                 focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15
                 focus:shadow-lg focus:shadow-[#852BAF]/10"
      placeholder="Confirm new password"
      autoComplete="new-password"
    />

    <button
      type="button"
      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
    >
      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  </div>
</div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 text-white font-bold py-3.5 rounded-full text-lg
                           bg-gradient-to-r from-[#852BAF] to-[#FC3F78]
                           shadow-lg shadow-[#852BAF]/25 transition-all duration-300 cursor-pointer
                           hover:bg-gradient-to-r hover:from-[#FC3F78] hover:to-[#852BAF]
                           hover:shadow-xl active:scale-95
                           disabled:opacity-60 disabled:cursor-not-allowed
                           inline-flex items-center justify-center"
              >
                {loading ? <LoaderCircle className="animate-spin" /> : "Reset Password"}
              </button>
            </form>

            <p className="relative mt-5 text-center text-sm text-slate-600">
              Remember your password?{" "}
              <button
                type="button"
                onClick={() => navigate("/login")}
                className="font-bold text-[#852BAF] hover:text-[#FC3F78] transition-all hover:underline cursor-pointer"
              >
                Login
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
