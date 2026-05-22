import React, { useState } from "react";
import { Link } from "react-router-dom";
import { AxiosError } from "axios";
import { useAuth } from "./useAuth";
import logoImage from "../assets/logo.svg";
import { Eye, EyeOff } from "lucide-react";

type Role = "vendor";

type FieldProps = {
  label: string;
  htmlFor: string;
  labelClass: string;
  children: React.ReactNode;
};

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

function Field({ label, htmlFor, labelClass, children }: FieldProps) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className={labelClass}>
        {label}
      </label>

      <div className="relative mt-1.5">
        <div
          className="pointer-events-none absolute -inset-0.5 rounded-xl opacity-0 blur-lg transition
                     bg-gradient-to-r from-[#852BAF]/25 to-[#FC3F78]/25
                     focus-within:opacity-100"
        />
        <div className="relative">{children}</div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  const { register, loading, error: authError } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "vendor" as Role,
    phone: "",
  });

  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setSubmitting(false);
      return;
    }

    try {
      await register(
        formData.name.trim(),
        formData.email.trim(),
        formData.password,
        "vendor",
        formData.phone.trim(),
      );
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        setError(err.response?.data?.message ?? "Register failed");
        setSubmitting(false);
      } else {
        setError("Unexpected error occurred");
        setSubmitting(false);
      }
    }
  };

  const labelClass = "text-sm font-semibold text-slate-700";
  const inputBase =
    "w-full px-4 py-2.5 rounded-xl bg-white text-slate-900 placeholder:text-slate-400 " +
    "border border-slate-200 shadow-sm outline-none transition-all duration-300 " +
    "focus:border-transparent focus:ring-4 focus:ring-[#852BAF]/15";

  if (submitting) {
    return <FullScreenLoader text="Creating your account..." />;
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-gradient-to-tr from-[#38bdf8] via-[#a855f7] to-[#ec4899] px-4">
      <div className="relative z-10 w-full max-w-5xl bg-white rounded-3xl shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-2">
        {/* LEFT SIDE */}
        <div className="relative hidden md:flex items-center justify-center bg-white p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_circle_at_15%_20%,rgba(56,189,248,0.12),transparent_55%),radial-gradient(900px_circle_at_85%_30%,rgba(168,85,247,0.10),transparent_55%),radial-gradient(900px_circle_at_50%_110%,rgba(236,72,153,0.08),transparent_55%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-[0.08] bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:18px_18px]" />

          <img
            src={logoImage}
            alt="Register"
            className="relative max-w-sm w-full select-none"
            draggable={false}
          />

          <div className="absolute bottom-8 left-8 right-8 text-slate-900">
            <p className="text-2xl font-extrabold leading-tight">
              Create your account
            </p>
            <p className="mt-2 text-[16px] font-medium text-gray-600 leading-relaxed">
              Join us and manage everything in one place.
            </p>
          </div>
        </div>

        {/* FORM */}
        <div className="w-full p-5 md:p-6">
          <h2 className="text-xl font-extrabold text-gray-900 mb-0.5">
            Create Account
          </h2>
          <p className="text-sm text-gray-500 mb-3">
            Join us and manage everything in one place.
          </p>

          {(error || authError) && (
            <div className="mb-3 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
              {error || (authError as string)}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3">
              <Field label="Full Name" htmlFor="name" labelClass={labelClass}>
                <input
                  id="name"
                  name="name"
                  className={inputBase}
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </Field>

              <Field
                label="Email Address"
                htmlFor="email"
                labelClass={labelClass}
              >
                <input
                  id="email"
                  name="email"
                  type="email"
                  className={inputBase}
                  value={formData.email}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      email: e.target.value.trimStart(),
                    }))
                  }
                  required
                  autoComplete="email"
                />
              </Field>

              <Field
                label="Phone Number"
                htmlFor="phone"
                labelClass={labelClass}
              >
                <input
                  id="phone"
                  name="phone"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={inputBase}
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData((p) => ({
                      ...p,
                      phone: e.target.value.replace(/\D/g, ""),
                    }))
                  }
                />
              </Field>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field
                  label="Password"
                  htmlFor="password"
                  labelClass={labelClass}
                >
                  <div className="relative">
                    <input
                      id="password"
                      name="password"
                      autoComplete="new-password"
                      type={showPassword ? "text" : "password"}
                      className={inputBase}
                      value={formData.password}
                      onChange={handleChange}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </Field>

                <Field
                  label="Confirm Password"
                  htmlFor="confirmPassword"
                  labelClass={labelClass}
                >
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      className={inputBase}
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      required
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                    >
                      {showConfirmPassword ? (
                        <EyeOff size={18} />
                      ) : (
                        <Eye size={18} />
                      )}
                    </button>
                  </div>
                </Field>
              </div>

              <button
                type="submit"
                disabled={submitting || loading}
                className="w-full mt-6 text-white font-bold py-3.5 rounded-full text-xl
                           bg-gradient-to-r from-[#852BAF] to-[#FC3F78]
                           shadow-lg shadow-[#852BAF]/25 transition-all duration-300
                           hover:from-[#FC3F78] hover:to-[#852BAF]
                           hover:shadow-xl active:scale-95
                           disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Creating Account...
                  </span>
                ) : (
                  "Register"
                )}
              </button>

              <p className="text-center text-sm text-gray-600">
                Already have an account?{" "}
                <Link
                  to="/login"
                  className="font-semibold text-[#852BAF] hover:underline"
                >
                  Login
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
