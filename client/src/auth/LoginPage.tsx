import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";
import logoImage from "../assets/logo.svg";
// import { User, Lock, Facebook, Twitter, Chrome } from "lucide-react";
import { User, Lock, Eye, EyeOff } from "lucide-react";

type Role =
  | "vendor"
  | "vendor_manager"
  | "admin"
  | "warehouse_manager"
  | "hr";

interface LoginForm {
  email: string;
  password: string;
  role: Role;
}

type LocationState = {
  message?: string;
};

/* ================= COMPONENT ================= */

export default function LoginPage() {
  const { login, loading, error: authError } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>("");

  const [formData, setFormData] = useState<LoginForm>({
    email: "",
    password: "",
    role: "vendor",
  });

  const location = useLocation();
  const state = location.state as LocationState | null;
  const successMessage = state?.message;

  /* ================= HANDLERS ================= */

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setError("");

    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value as Role | string,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      await login(
        formData.email.trim(),
        formData.password,
        formData.role
      );
    } catch (err) {
      setError("Login failed. Please check your credentials.");
      console.error(err);
    }
  };



  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-tr from-[#38bdf8] via-[#a855f7] to-[#ec4899] font-sans px-4">
      <div className="grid w-full max-w-5xl grid-cols-1 overflow-hidden bg-white shadow-2xl rounded-3xl md:grid-cols-2">
        <div className="relative hidden bg-white md:block">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_circle_at_15%_20%,rgba(56,189,248,0.12),transparent_55%),radial-gradient(900px_circle_at_85%_30%,rgba(168,85,247,0.10),transparent_55%),radial-gradient(900px_circle_at_50%_110%,rgba(236,72,153,0.08),transparent_55%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.08] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:18px_18px]" />

          <div className="relative flex items-center justify-center w-full h-full p-10">
            <img
              src={logoImage}
              alt="Login Illustration"
              className="w-full max-w-md drop-shadow-2xl select-none mt-[-4em]"
              draggable={false}
            />
          </div>

          <div className="absolute bottom-8 left-8 right-8 text-slate-900">
            <p className="text-2xl font-extrabold leading-tight">
              Welcome back{" "}
            </p>
            <p className="mt-2 text-[16px] font-medium text-gray-600 leading-relaxed">
              Sign in and continue to your dashboard.
            </p>
          </div>

          <div className="pointer-events-none absolute top-0 right-0 h-full w-[2px] bg-gradient-to-b from-transparent via-slate-200 to-transparent" />
          <div className="pointer-events-none absolute top-0 right-[-10px] h-full w-[22px] bg-gradient-to-l from-[#852BAF]/10 via-[#FC3F78]/5 to-transparent blur-xl" />
        </div>

        <div className="relative w-full px-10 py-5 bg-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_circle_at_50%_0%,rgba(133,43,175,0.05),transparent_45%)]" />

          {/* Header */}
          <h2 className="relative text-3xl font-extrabold text-center text-gray-900">
            Hello!
          </h2>

          <p className="mt-1 mb-8 text-xl text-center text-gray-500">
            Sign in to your Account
          </p>

          {successMessage && (
            <div className="p-3 mb-4 text-green-700 border border-green-200 bg-green-50 rounded-xl">
              {successMessage}
            </div>
          )}

          {(error || authError) && (
            <div className="relative p-3 mb-4 text-sm text-red-700 border border-red-200 shadow-sm rounded-xl bg-red-50">
              {error || authError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="relative space-y-8">
            {/* Email/Username Field */}
            <div className="space-y-6">
              {/* Email Field */}
              <div className="relative">
                <label className="text-sm font-semibold tracking-wide text-slate-700">
                  Email
                </label>

                <div
                  className="mt-2 flex items-center gap-3 w-full px-4 py-2.5 rounded-xl bg-white
                 border border-slate-200 shadow-sm
                 transition-all duration-300
                 focus-within:border-transparent
                 focus-within:ring-4 focus-within:ring-[#852BAF]/15
                 focus-within:shadow-lg focus-within:shadow-[#852BAF]/10"
                >
                  <User className="w-5 h-5 text-gray-600" />

                  <input
                    name="email"
                    type="email"
                    required
                    className="w-full text-gray-800 bg-transparent outline-none placeholder:text-gray-400"
                    placeholder="name@company.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        email: e.target.value.trimStart(),
                      }))
                    }
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password Field */}
              <div className="relative">
                <label className="text-sm font-semibold tracking-wide text-slate-700">
                  Password
                </label>

                <div
                  className="mt-2 flex items-center gap-3 w-full px-4 py-2.5 rounded-xl bg-white
                 border border-slate-200 shadow-sm
                 transition-all duration-300
                 focus-within:border-transparent
                 focus-within:ring-4 focus-within:ring-[#852BAF]/15
                 focus-within:shadow-lg focus-within:shadow-[#852BAF]/10"
                >
                  <Lock className="w-5 h-5 text-gray-600" />

                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    className="w-full text-gray-800 bg-transparent outline-none placeholder:text-gray-400"
                    placeholder="********"
                    value={formData.password}
                    onChange={handleChange}
                    autoComplete="current-password"
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-400 cursor-pointer hover:text-gray-600 focus:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end">
              {/*  Social icons (kept for later use) */}
              {/*
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-[#3b5998] text-white hover:opacity-80 transition-opacity"
        >
          <Facebook size={16} fill="currentColor" />
        </button>
        <button
          type="button"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-[#1da1f2] text-white hover:opacity-80 transition-opacity"
        >
          <Twitter size={16} fill="currentColor" />
        </button>
        <button
          type="button"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-[#ea4335] text-white hover:opacity-80 transition-opacity"
        >
          <Chrome size={16} />
        </button>
      </div>
      */}

              <Link
                to="/forgot-password"
                className="text-md text-purple-600 hover:text-[#FC3F78] transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading || !formData.email || !formData.password}
              className="w-full mt-6 text-white font-bold py-3.5 rounded-full text-xl
               bg-gradient-to-r from-[#852BAF] to-[#FC3F78]
               shadow-lg shadow-[#852BAF]/25 transition-all duration-300 cursor-pointer
               hover:bg-gradient-to-r hover:from-[#FC3F78] hover:to-[#852BAF]
               hover:shadow-xl active:scale-95
               disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white rounded-full animate-spin border-t-transparent" />
                  Logging in...
                </span>
              ) : (
                "Login"
              )}
            </button>
          </form>

          <div className="relative mt-5 text-center">
            <p className="mt-5 text-center text-gray-700 text-md">
              Don&apos;t have an account?{" "}
              <Link
                to="/register"
                className="font-semibold text-purple-600 hover:text-[#FC3F78] transition-all hover:underline"
              >
                Create Account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
