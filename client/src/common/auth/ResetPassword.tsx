import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "../api/api";
import AuthShell from "./AuthShell";

const getResetErrorMessage = (error: unknown) => {
  if (typeof error === "object" && error !== null) {
    const requestError = error as { response?: { data?: { message?: string } } };
    if (requestError.response?.data?.message) return requestError.response.data.message;
  }
  return error instanceof Error ? error.message : "Password reset failed. Please try again.";
};

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const passwordChecks = [
    { label: "At least 8 characters", valid: password.length >= 8 },
    { label: "Passwords match", valid: Boolean(password) && password === confirmPassword },
  ];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post("/auth/reset-password", { token, password, confirmPassword });
      if (!response.data?.success) throw new Error(response.data?.message || "Password reset failed");
      setSuccess(true);
      window.setTimeout(() => navigate("/login", { replace: true, state: { message: "Password reset successfully. Sign in with your new password." } }), 2200);
    } catch (requestError: unknown) {
      setError(getResetErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthShell eyebrow="Link unavailable" title="This reset link isn't valid" description="The link may be incomplete, expired, or already used. Request a fresh link to continue securely." compact>
        <div className="relative overflow-hidden rounded-3xl border border-red-200 bg-gradient-to-br from-red-50 to-white p-6 shadow-[0_12px_35px_rgba(239,68,68,0.08)]">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-red-200/30 blur-2xl" />
          <div className="relative"><div className="grid h-13 w-13 place-items-center rounded-2xl bg-red-500 text-white shadow-lg shadow-red-500/20"><ShieldAlert className="h-6 w-6" /></div><h2 className="mt-5 text-lg font-extrabold text-slate-900">Request a new reset link</h2><p className="mt-2 text-sm leading-6 text-slate-600">For your security, password reset links expire after 5 minutes and can only be used once.</p></div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2"><Link to="/forgot-password" className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#1d102b] px-4 text-sm font-bold text-white transition hover:bg-[#852BAF]">New reset link <ArrowRight size={15} /></Link><Link to="/login" className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition hover:border-purple-300 hover:text-purple-700"><ArrowLeft size={15} /> Sign in</Link></div>
      </AuthShell>
    );
  }

  if (success) {
    return (
      <AuthShell eyebrow="Password updated" title="You're ready to sign in" description="Your account has been secured with your new password." compact>
        <div className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-7 text-center shadow-[0_12px_35px_rgba(16,185,129,0.1)]"><div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"><CheckCircle2 className="h-8 w-8" /></div><h2 className="mt-5 text-xl font-extrabold text-slate-900">Password reset successfully</h2><p className="mt-2 text-sm leading-6 text-slate-500">Redirecting you to the secure sign-in page...</p><div className="mx-auto mt-5 h-1.5 max-w-52 overflow-hidden rounded-full bg-emerald-100"><div className="h-full w-full origin-left animate-[pulse_1.5s_ease-in-out_infinite] rounded-full bg-emerald-500" /></div></div>
        <button type="button" onClick={() => navigate("/login", { replace: true })} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#1d102b] text-sm font-bold text-white transition hover:bg-[#852BAF]">Continue to sign in <ArrowRight size={15} /></button>
      </AuthShell>
    );
  }

  const inputWrap = "group flex h-13 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 transition focus-within:border-purple-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-purple-100";

  return (
    <AuthShell eyebrow="Secure recovery" title="Create a new password" description="Choose a strong password you haven't used before. Your other active sessions will be signed out." compact>
      {error && <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="new-password" className="mb-2 block text-sm font-semibold text-slate-700">New password</label>
          <div className={inputWrap}><LockKeyhole className="h-5 w-5 shrink-0 text-slate-400 transition group-focus-within:text-purple-600" /><input id="new-password" type={showPassword ? "text" : "password"} required autoFocus autoComplete="new-password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} placeholder="Enter at least 8 characters" className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
        </div>

        <div>
          <label htmlFor="confirm-password" className="mb-2 block text-sm font-semibold text-slate-700">Confirm new password</label>
          <div className={inputWrap}><LockKeyhole className="h-5 w-5 shrink-0 text-slate-400 transition group-focus-within:text-purple-600" /><input id="confirm-password" type={showConfirmPassword ? "text" : "password"} required autoComplete="new-password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setError(""); }} placeholder="Re-enter your new password" className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" /><button type="button" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? "Hide password" : "Show password"} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700">{showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
        </div>

        <div className="grid gap-2 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-2">
          {passwordChecks.map((check) => <div key={check.label} className={`flex items-center gap-2 text-xs font-semibold ${check.valid ? "text-emerald-700" : "text-slate-400"}`}><span className={`grid h-5 w-5 place-items-center rounded-full ${check.valid ? "bg-emerald-100" : "bg-slate-200/70"}`}><Check size={12} strokeWidth={3} /></span>{check.label}</div>)}
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-purple-100 bg-purple-50/60 px-4 py-3 text-xs leading-5 text-purple-800"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />Resetting your password revokes existing refresh sessions to protect your account.</div>

        <button type="submit" disabled={loading || password.length < 8 || password !== confirmPassword} className="group flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#1d102b] px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(29,16,43,0.22)] transition hover:-translate-y-0.5 hover:bg-[#852baf] hover:shadow-[0_16px_32px_rgba(133,43,175,0.28)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55">{loading ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Securing account...</> : <>Update password <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></>}</button>
      </form>

      <div className="mt-7 border-t border-slate-100 pt-6 text-center"><Link to="/login" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-[#852BAF]"><ArrowLeft size={15} /> Back to sign in</Link></div>
    </AuthShell>
  );
}
