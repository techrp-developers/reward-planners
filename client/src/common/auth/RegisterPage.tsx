import React, { useState } from "react";
import { Link } from "react-router-dom";
import { AxiosError } from "axios";
import { AlertCircle, ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Phone, UserRound } from "lucide-react";
import { useAuth } from "./useAuth";
import AuthShell from "./AuthShell";

export default function RegisterPage() {
  const { register, loading, error: authError } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({ name: "", email: "", phone: "", password: "", confirmPassword: "" });

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setError("");
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match. Please try again.");
      return;
    }

    setSubmitting(true);
    try {
      await register(formData.name.trim(), formData.email.trim(), formData.password, "vendor", formData.phone.trim());
    } catch (err: unknown) {
      setError(err instanceof AxiosError ? (err.response?.data?.message ?? "Registration failed") : "Unexpected error occurred");
      setSubmitting(false);
    }
  };

  const inputWrap = "group flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 transition focus-within:border-purple-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-purple-100";
  const labelClass = "mb-2 block text-sm font-semibold text-slate-700";

  return (
    <AuthShell compact eyebrow="Get started" title="Create your account" description="Enter your details to set up your secure workspace.">
      {(error || authError) && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error || String(authError)}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className={labelClass}>Full name</label>
          <div className={inputWrap}>
            <UserRound className="h-4.5 w-4.5 text-slate-400 transition group-focus-within:text-purple-600" />
            <input id="name" name="name" required autoComplete="name" placeholder="Your full name" value={formData.name} onChange={handleChange} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="email" className={labelClass}>Email address</label>
            <div className={inputWrap}>
              <Mail className="h-4.5 w-4.5 shrink-0 text-slate-400 transition group-focus-within:text-purple-600" />
              <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" value={formData.email} onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value.trimStart() }))} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
            </div>
          </div>
          <div>
            <label htmlFor="phone" className={labelClass}>Phone number <span className="font-normal text-slate-400">(optional)</span></label>
            <div className={inputWrap}>
              <Phone className="h-4.5 w-4.5 shrink-0 text-slate-400 transition group-focus-within:text-purple-600" />
              <input id="phone" name="phone" inputMode="numeric" autoComplete="tel" placeholder="98765 43210" value={formData.phone} onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value.replace(/\D/g, "").slice(0, 15) }))} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="password" className={labelClass}>Password</label>
            <div className={inputWrap}>
              <LockKeyhole className="h-4.5 w-4.5 shrink-0 text-slate-400 transition group-focus-within:text-purple-600" />
              <input id="password" name="password" type={showPassword ? "text" : "password"} required autoComplete="new-password" placeholder="Create password" value={formData.password} onChange={handleChange} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
              <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} className="text-slate-400 hover:text-slate-700">{showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}</button>
            </div>
          </div>
          <div>
            <label htmlFor="confirmPassword" className={labelClass}>Confirm password</label>
            <div className={inputWrap}>
              <LockKeyhole className="h-4.5 w-4.5 shrink-0 text-slate-400 transition group-focus-within:text-purple-600" />
              <input id="confirmPassword" name="confirmPassword" type={showConfirmPassword ? "text" : "password"} required autoComplete="new-password" placeholder="Repeat password" value={formData.confirmPassword} onChange={handleChange} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400" />
              <button type="button" onClick={() => setShowConfirmPassword((v) => !v)} aria-label={showConfirmPassword ? "Hide password" : "Show password"} className="text-slate-400 hover:text-slate-700">{showConfirmPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}</button>
            </div>
          </div>
        </div>

        <p className="text-xs leading-5 text-slate-400">By creating an account, you agree to use the platform responsibly and keep your account details secure.</p>

        <button type="submit" disabled={submitting || loading} className="group flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-[#1d102b] px-5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(29,16,43,0.22)] transition hover:-translate-y-0.5 hover:bg-[#852baf] hover:shadow-[0_16px_32px_rgba(133,43,175,0.28)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-55">
          {submitting || loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Creating account...</> : <>Create account <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></>}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-500">Already have an account? <Link to="/login" className="font-bold text-purple-700 hover:text-pink-600">Sign in</Link></p>
    </AuthShell>
  );
}
