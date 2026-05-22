import { useState } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../api/api";
import { Lock, ShieldCheck, LoaderCircle, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";

export default function ChangePasswordPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /* password strength */
  const strength = (() => {
    if (!newPassword) return 0;
    let s = 0;
    if (newPassword.length >= 8) s++;
    if (/[A-Z]/.test(newPassword)) s++;
    if (/[0-9]/.test(newPassword)) s++;
    if (/[^A-Za-z0-9]/.test(newPassword)) s++;
    return s;
  })();

  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = ["", "bg-red-400", "bg-amber-400", "bg-blue-400", "bg-emerald-500"][strength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      setError("User not authenticated.");
      return;
    }

    const email = user?.email;
    setError(null);
    setSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All fields are required.");
      return;
    }

    if (newPassword.length < 5) {
      setError("New password must be at least 5 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirm password do not match.");
      return;
    }

    try {
      setLoading(true);

      const res = await api.post("/auth/password/reset", {
        email,
        currentPassword,
        newPassword,
      });

      if (!res.data?.success) {
        throw new Error(res.data?.message || "Password change failed");
      }

      setSuccess("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e?.response?.data?.message || e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full pl-11 pr-12 py-3 bg-gray-50/60 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 outline-none transition-all focus:ring-4 focus:ring-[#852BAF]/15 focus:border-[#852BAF] focus:bg-white";

  return (
    <div className="max-w-7xl mx-auto">

      {/* ── PAGE HEADER ── */}
      <div
        className="flex items-center justify-between mb-6 p-5 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            Change <span className="gradient-text-brand">Password</span>
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Keep your account secure with a strong password
          </p>
        </div>

        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0"
          style={{
            background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
            boxShadow: "0 6px 20px rgba(133,43,175,0.25)",
          }}
        >
          <ShieldCheck size={20} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── FORM CARD ── */}
        <div
          className="lg:col-span-2 bg-white rounded-2xl p-6 sm:p-8 vendor-section-card"
          style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}
        >
          {/* Alerts */}
          {error && (
            <div
              className="flex items-center gap-3 p-4 mb-6 rounded-xl border text-sm font-medium text-red-700"
              style={{ background: "rgba(239,68,68,0.04)", borderColor: "rgba(239,68,68,0.18)" }}
            >
              <XCircle size={16} className="shrink-0 text-red-500" />
              {error}
            </div>
          )}

          {success && (
            <div
              className="flex items-center gap-3 p-4 mb-6 rounded-xl border text-sm font-medium text-emerald-700"
              style={{ background: "rgba(16,185,129,0.04)", borderColor: "rgba(16,185,129,0.18)" }}
            >
              <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Current Password */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Current Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  size={15}
                />
                <input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={inputCls}
                  placeholder="Enter current password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                New Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  size={15}
                />
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputCls}
                  placeholder="Enter new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
                >
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Strength bar */}
              {newPassword && (
                <div className="mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((s) => (
                      <div
                        key={s}
                        className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                          s <= strength ? strengthColor : "bg-gray-100"
                        }`}
                      />
                    ))}
                  </div>
                  <p className={`text-xs font-semibold mt-1 ${["", "text-red-500", "text-amber-500", "text-blue-600", "text-emerald-600"][strength]}`}>
                    {strengthLabel}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Confirm New Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  size={15}
                />
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`${inputCls} ${
                    confirmPassword && newPassword && confirmPassword !== newPassword
                      ? "border-red-300 focus:border-red-400 focus:ring-red-200/30"
                      : confirmPassword && confirmPassword === newPassword
                        ? "border-emerald-300 focus:border-emerald-400 focus:ring-emerald-200/30"
                        : ""
                  }`}
                  placeholder="Confirm new password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer transition-colors"
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                {confirmPassword && confirmPassword === newPassword && (
                  <CheckCircle2 className="absolute right-10 top-1/2 -translate-y-1/2 text-emerald-500" size={14} />
                )}
              </div>
              {confirmPassword && newPassword && confirmPassword !== newPassword && (
                <p className="text-xs text-red-500 font-medium mt-1">Passwords do not match</p>
              )}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 text-base font-bold text-white rounded-2xl cursor-pointer transition-all duration-300 hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
                  boxShadow: "0 8px 24px rgba(133,43,175,0.3)",
                }}
              >
                {loading ? (
                  <LoaderCircle className="animate-spin" size={20} />
                ) : (
                  <>
                    <ShieldCheck size={17} />
                    Update Password
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* ── SECURITY TIPS CARD ── */}
        <div
          className="bg-white rounded-2xl p-6 vendor-section-card h-fit"
          style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}
        >
          <div className="flex items-center gap-3 pb-4 border-b border-gray-100 mb-5">
            <div
              className="p-2.5 text-white rounded-xl shrink-0"
              style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
            >
              <ShieldCheck size={16} />
            </div>
            <h3 className="text-sm font-extrabold text-gray-800">Password Tips</h3>
          </div>

          <ul className="space-y-3">
            {[
              { ok: newPassword.length >= 8, text: "At least 8 characters" },
              { ok: /[A-Z]/.test(newPassword), text: "One uppercase letter" },
              { ok: /[0-9]/.test(newPassword), text: "One number" },
              { ok: /[^A-Za-z0-9]/.test(newPassword), text: "One special character" },
              { ok: newPassword === confirmPassword && confirmPassword.length > 0, text: "Passwords match" },
            ].map(({ ok, text }) => (
              <li key={text} className="flex items-center gap-2.5 text-xs font-medium">
                <span
                  className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300 ${
                    ok ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-300"
                  }`}
                >
                  {ok ? "✓" : "·"}
                </span>
                <span className={ok ? "text-gray-700" : "text-gray-400"}>{text}</span>
              </li>
            ))}
          </ul>

          <div
            className="mt-6 p-3 rounded-xl text-xs font-medium text-gray-500"
            style={{ background: "rgba(133,43,175,0.04)", border: "1px solid rgba(133,43,175,0.08)" }}
          >
            Never share your password with anyone, including support staff.
          </div>
        </div>

      </div>
    </div>
  );
}
