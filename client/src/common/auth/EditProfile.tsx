import { useState } from "react";
import { useAuth } from "../auth/useAuth";
import { api } from "../api/api";
import {
  User,
  Mail,
  Phone,
  UserCog,
  LoaderCircle,
  CheckCircle2,
  XCircle,
} from "lucide-react";

export default function EditProfilePage() {
  const { user, updateUser } = useAuth();

  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }

    try {
      setLoading(true);

      const res = await api.put("/auth/profile", {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
      });

      if (!res.data?.success) {
        throw new Error(res.data?.message || "Profile update failed");
      }

      updateUser(res.data.data);
      setSuccess("Profile updated successfully.");
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e?.response?.data?.message || e?.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 outline-none transition-all focus:ring-2 focus:ring-[#852BAF]/15 focus:border-[#852BAF] focus:bg-white";

  return (
    <div className="account-settings max-w-5xl mx-auto">
      {/* ── PAGE HEADER ── */}
      <div
        className="flex items-center justify-between gap-4 mb-6"
      >
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Edit <span className="text-slate-900">Profile</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Update your name, email and phone number
          </p>
        </div>

        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-50 text-[#852BAF] shrink-0"
        >
          <UserCog size={20} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── FORM CARD ── */}
        <div
          className="lg:col-span-2 bg-white rounded-xl border border-purple-100 p-5 sm:p-6 shadow-sm"
        >
          {/* Alerts */}
          {error && (
            <div
              role="alert" className="flex items-center gap-3 p-3 mb-5 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700"
            >
              <XCircle size={16} className="shrink-0 text-red-500" />
              {error}
            </div>
          )}

          {success && (
            <div
              role="status" className="flex items-center gap-3 p-3 mb-5 rounded-lg border border-emerald-200 bg-emerald-50 text-sm text-emerald-700"
            >
              <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name */}
            <div>
              <label htmlFor="profile-name" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Full Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  size={15}
                />
                <input
                  id="profile-name"
                  autoComplete="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                  placeholder="Enter your name"
                  required
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="profile-email" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  size={15}
                />
                <input
                  id="profile-email"
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                  placeholder="Enter your email"
                  required
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                You'll need to use the new email next time you log in.
              </p>
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="profile-phone" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Phone
              </label>
              <div className="relative">
                <Phone
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  size={15}
                />
                <input
                  id="profile-phone"
                  autoComplete="tel"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputCls}
                  placeholder="Enter your phone number"
                />
              </div>
            </div>

            <div className="border-t border-purple-100 pt-5">
              <button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#852BAF] rounded-lg cursor-pointer transition-colors hover:bg-[#702393] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><LoaderCircle className="animate-spin" size={16} /> Saving...</>
                ) : (
                  <>
                    <UserCog size={17} />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* ── ACCOUNT INFO CARD ── */}
        <div
          className="bg-white rounded-xl border border-purple-100 p-5 sm:p-6 h-fit"
        >
          <div className="flex items-center gap-3 pb-4 border-b border-gray-100 mb-5">
            <div
              className="p-2 bg-purple-50 text-[#852BAF] rounded-lg shrink-0"
            >
              <UserCog size={16} />
            </div>
            <h3 className="text-sm font-semibold text-gray-800">Account Info</h3>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-slate-500">Role</p>
              <p className="text-sm font-semibold text-gray-800 capitalize mt-0.5">
                {user?.role?.replace(/_/g, " ")}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Account ID</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">#{user?.user_id}</p>
            </div>
          </div>

          <div
            className="mt-6 border-t border-purple-100 pt-4 text-xs leading-5 text-slate-500"
          >
            Changing your email updates the address you use to sign in.
          </div>
        </div>
      </div>
    </div>
  );
}
