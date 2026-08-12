import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlertCircle, ArrowRight, Building2, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useAuth } from "./useAuth";
import AuthShell from "./AuthShell";

type LocationState = { message?: string };

export default function LoginPage() {
  const { login, loading, error: authError } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({ email: "", password: "" });
  const state = useLocation().state as LocationState | null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      await login(formData.email.trim(), formData.password);
    } catch (err) {
      setError("Login failed. Please check your credentials.");
      console.error(err);
    }
  };

  const inputWrap = "group flex h-13 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 transition focus-within:border-purple-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-purple-100";

  return (
    <AuthShell eyebrow="Welcome back" title="Sign in to your account" description="Access your personalized workspace based on your assigned role.">
      {state?.message && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {state.message}
        </div>
      )}
      {(error || authError) && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error || authError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">Work email</label>
          <div className={inputWrap}>
            <Mail className="h-5 w-5 text-slate-400 transition group-focus-within:text-purple-600" />
            <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value.trimStart() }))} className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</label>
            <Link to="/forgot-password" className="text-xs font-semibold text-purple-700 transition hover:text-pink-600">Forgot password?</Link>
          </div>
          <div className={inputWrap}>
            <LockKeyhole className="h-5 w-5 text-slate-400 transition group-focus-within:text-purple-600" />
            <input id="password" name="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" placeholder="Enter your password" value={formData.password} onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))} className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700">
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={loading || !formData.email || !formData.password} className="group flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#1d102b] px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(29,16,43,0.22)] transition hover:-translate-y-0.5 hover:bg-[#852baf] hover:shadow-[0_16px_32px_rgba(133,43,175,0.28)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55">
          {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Signing in...</> : <>Sign in <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></>}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">New here? <Link to="/register" className="font-bold text-purple-700 hover:text-pink-600">Create an account</Link></p>

      <Link to="/client-onboarding" className="mt-7 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 transition hover:border-purple-200 hover:bg-purple-50/50">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-100 text-purple-700"><Building2 className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-800">Register an organization</span><span className="block text-xs text-slate-500">Set up a new organization workspace</span></span>
        <ArrowRight className="h-4 w-4 text-slate-400" />
      </Link>
    </AuthShell>
  );
}
