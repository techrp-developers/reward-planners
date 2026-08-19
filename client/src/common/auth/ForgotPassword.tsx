import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { api } from "../api/api";
import AuthShell from "./AuthShell";

const getErrorMessage = (error: unknown, fallback = "Something went wrong") => {
  if (typeof error === "object" && error !== null) {
    const requestError = error as { response?: { data?: { message?: string } } };
    if (requestError.response?.data?.message) return requestError.response.data.message;
  }
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : fallback;
};

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter the email address associated with your account.");
      return;
    }

    try {
      setLoading(true);
      await api.post("/auth/forgot-password", { email: normalizedEmail });
      setSuccess(true);
    } catch (requestError: unknown) {
      setError(getErrorMessage(requestError, "We couldn't send the reset email. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      eyebrow="Account recovery"
      title={success ? "Check your inbox" : "Reset your password"}
      description={success ? "We've processed your password reset request securely." : "Enter your work email and we'll send you a secure, time-limited reset link."}
      compact
    >
      {success ? (
        <div className="space-y-6">
          <div className="relative overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-[0_12px_35px_rgba(16,185,129,0.1)]">
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-emerald-200/30 blur-2xl" />
            <div className="relative">
              <div className="grid h-13 w-13 place-items-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h2 className="mt-5 text-lg font-extrabold text-slate-900">Reset link requested</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                If an account exists for <span className="font-bold text-slate-800">{email.trim()}</span>, a reset link will arrive shortly. It remains valid for 5 minutes.
              </p>
              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-white/80 px-4 py-3 text-xs leading-5 text-emerald-800">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                Check your spam folder if you don't see it, and never share the reset link with anyone.
              </div>
            </div>
          </div>

          <button type="button" onClick={() => { setSuccess(false); setError(""); }} className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-bold text-slate-700 transition hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700">
            Try another email
          </button>
          <Link to="/login" className="flex items-center justify-center gap-2 text-sm font-bold text-[#852BAF] transition hover:text-[#FC3F78]"><ArrowLeft size={15} /> Return to sign in</Link>
        </div>
      ) : (
        <>
          {error && (
            <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="recovery-email" className="mb-2 block text-sm font-semibold text-slate-700">Work email</label>
              <div className="group flex h-13 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 transition focus-within:border-purple-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-purple-100">
                <Mail className="h-5 w-5 shrink-0 text-slate-400 transition group-focus-within:text-purple-600" />
                <input id="recovery-email" type="email" required autoFocus autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} placeholder="you@company.com" className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">Use the same email address you use to sign in to the portal.</p>
            </div>

            <button type="submit" disabled={loading || !email.trim()} className="group flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#1d102b] px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(29,16,43,0.22)] transition hover:-translate-y-0.5 hover:bg-[#852baf] hover:shadow-[0_16px_32px_rgba(133,43,175,0.28)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55">
              {loading ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Sending secure link...</> : <>Send reset link <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></>}
            </button>
          </form>

          <div className="mt-7 border-t border-slate-100 pt-6 text-center">
            <Link to="/login" className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-[#852BAF]"><ArrowLeft size={15} /> Back to sign in</Link>
          </div>
        </>
      )}
    </AuthShell>
  );
}
