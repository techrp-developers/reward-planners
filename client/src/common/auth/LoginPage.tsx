import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AxiosError } from "axios";
import { AlertCircle, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
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
      setError(err instanceof AxiosError
        ? String(err.response?.data?.message || "Login failed. Please check your credentials.")
        : err instanceof Error ? err.message : "Login failed. Please check your credentials.");
      console.error(err);
    }
  };

  const inputWrap = "group flex h-11 items-center gap-3 rounded-lg border border-gray-300 bg-white px-3 transition focus-within:border-[#852BAF] focus-within:ring-2 focus-within:ring-[#852BAF]/15";

  return (
    <AuthShell title="Sign in to your account" description="Access your personalized workspace based on your assigned role.">
      {state?.message && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {state.message}
        </div>
      )}
      {(error || authError) && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error || authError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-700">Work email</label>
          <div className={inputWrap}>
            <Mail className="h-5 w-5 text-slate-400 transition group-focus-within:text-[#852BAF]" />
            <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value.trimStart() }))} className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-semibold text-slate-700">Password</label>
            <Link to="/forgot-password" className="text-xs font-semibold text-[#852BAF] hover:underline">Forgot password?</Link>
          </div>
          <div className={inputWrap}>
            <LockKeyhole className="h-5 w-5 text-slate-400 transition group-focus-within:text-[#852BAF]" />
            <input id="password" name="password" type={showPassword ? "text" : "password"} required autoComplete="current-password" placeholder="Enter your password" value={formData.password} onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))} className="h-full min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700">
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <button type="submit" disabled={loading || !formData.email || !formData.password} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#180d26] px-5 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-55 hover:bg-[#2e1a47]">
          {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Signing in...</> : <>Sign in</>}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">New here? <Link to="/register" className="font-bold text-[#852BAF] hover:underline">Create an account</Link></p>

    </AuthShell>
  );
}
