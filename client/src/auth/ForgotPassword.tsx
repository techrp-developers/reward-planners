import { LoaderCircle, Mail, ArrowLeft } from "lucide-react";
import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { api } from "../api/api";
import { Link } from "react-router-dom";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const getErrorMessage = (err: unknown, fallback = "Something went wrong") => {
    if (!err) return fallback;
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    if (typeof err === "object" && err !== null) {
      const maybe = err as { response?: { data?: { message?: string } } };
      return maybe.response?.data?.message ?? fallback;
    }
    return fallback;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Please enter a valid email.");
      return;
    }

    try {
      setLoading(true);
      await api.post("/auth/forgot-password", { email: email.trim() });
      setSuccess(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to send reset email"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen overflow-hidden flex items-center justify-center bg-gradient-to-tr from-[#38bdf8] via-[#a855f7] to-[#ec4899] px-4">
      {/* premium glass ring */}
      <div className="w-full max-w-md">
        <div className="relative rounded-3xl p-[1px] bg-gradient-to-r from-white/40 via-white/10 to-white/40 shadow-2xl">
          <div className="relative rounded-3xl bg-white/95 backdrop-blur-xl px-7 py-7 shadow-xl overflow-hidden">
            {/* soft premium blobs */}
            <div className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-[#38bdf8]/20 blur-2xl" />
            <div className="pointer-events-none absolute -bottom-28 -left-28 h-64 w-64 rounded-full bg-[#ec4899]/15 blur-2xl" />
            <div className="pointer-events-none absolute inset-0 opacity-[0.06] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:18px_18px]" />

            {/* header */}
            <div className="relative">
              <div className="flex items-center justify-between">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition"
                >
                  <ArrowLeft size={16} />
                  Back
                </Link>
                <div className="h-9 w-9 rounded-2xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] shadow-md shadow-[#852BAF]/20 flex items-center justify-center">
                  <Mail className="text-white" size={18} />
                </div>
              </div>

              <h2 className="mt-4 text-2xl font-extrabold text-slate-900">
                Forgot Password?
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Enter your email and we'll send you a reset link.
              </p>
            </div>

            {/* content */}
            <div className="relative mt-6">
              {success ? (
                <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-green-700 text-sm">
                  Reset email sent. Please check your inbox.
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold tracking-widest text-slate-600 uppercase">
                      Email Address
                    </label>

                    <div className="relative group mt-2">
                      {/* glow */}
                      <div
                        className="pointer-events-none absolute -inset-0.5 rounded-2xl opacity-0 blur-lg transition duration-300
                                   bg-gradient-to-r from-[#852BAF]/25 to-[#FC3F78]/25
                                   group-focus-within:opacity-100"
                      />
                      <Mail className="absolute left-4 top-3.5 text-slate-400 pointer-events-none" size={18} />

                      <input
                        type="email"
                        value={email}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setEmail(e.target.value)
                        }
                        className="relative w-full pl-11 pr-4 py-3 rounded-2xl bg-white/90 text-slate-900 placeholder:text-slate-400
                                   border border-slate-200 shadow-sm outline-none transition-all duration-300
                                   focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15 focus:shadow-lg focus:shadow-[#852BAF]/10"
                        placeholder="Enter your email"
                        autoComplete="email"
                      />
                    </div>

                    {error && (
                      <p className="mt-2 text-sm text-red-600">{error}</p>
                    )}
                  </div>

                  <button
                    disabled={loading}
                    className="w-full text-white font-bold py-3.5 rounded-full text-base
                               bg-gradient-to-r from-[#852BAF] to-[#FC3F78]
                               shadow-lg shadow-[#852BAF]/25 transition-all duration-300 cursor-pointer
                               hover:bg-gradient-to-r hover:from-[#FC3F78] hover:to-[#852BAF]
                               hover:shadow-xl active:scale-95
                               disabled:opacity-60 disabled:cursor-not-allowed
                               inline-flex items-center justify-center"
                  >
                    {loading ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      "Reset Password"
                    )}
                  </button>
                </form>
              )}
            </div>

            <p className="relative mt-5 text-center text-sm text-slate-600">
              Remembered your password?{" "}
              <Link
                to="/login"
                className="font-bold text-[#852BAF] hover:text-[#FC3F78] transition-all hover:underline"
              >
                Back to Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
