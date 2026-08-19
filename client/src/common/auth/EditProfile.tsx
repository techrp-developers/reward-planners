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
    "w-full pl-11 pr-4 py-3 bg-gray-50/60 border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 outline-none transition-all focus:ring-4 focus:ring-[#852BAF]/15 focus:border-[#852BAF] focus:bg-white";

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
            Edit <span className="gradient-text-brand">Profile</span>
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Update your name, email and phone number
          </p>
        </div>

        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0"
          style={{
            background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
            boxShadow: "0 6px 20px rgba(133,43,175,0.25)",
          }}
        >
          <UserCog size={20} />
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
            {/* Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Full Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <User
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  size={15}
                />
                <input
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
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Email <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  size={15}
                />
                <input
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
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                Phone
              </label>
              <div className="relative">
                <Phone
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  size={15}
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputCls}
                  placeholder="Enter your phone number"
                />
              </div>
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
          className="bg-white rounded-2xl p-6 vendor-section-card h-fit"
          style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}
        >
          <div className="flex items-center gap-3 pb-4 border-b border-gray-100 mb-5">
            <div
              className="p-2.5 text-white rounded-xl shrink-0"
              style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
            >
              <UserCog size={16} />
            </div>
            <h3 className="text-sm font-extrabold text-gray-800">Account Info</h3>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Role</p>
              <p className="text-sm font-semibold text-gray-800 capitalize mt-0.5">
                {user?.role?.replace(/_/g, " ")}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Account ID</p>
              <p className="text-sm font-semibold text-gray-800 mt-0.5">#{user?.user_id}</p>
            </div>
          </div>

          <div
            className="mt-6 p-3 rounded-xl text-xs font-medium text-gray-500"
            style={{ background: "rgba(133,43,175,0.04)", border: "1px solid rgba(133,43,175,0.08)" }}
          >
            Changing your email updates the address you use to sign in.
          </div>
        </div>
      </div>
    </div>
  );
}
