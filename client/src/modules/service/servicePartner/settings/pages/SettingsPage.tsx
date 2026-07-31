import { useState } from "react";
import { FiSettings, FiLock, FiBell, FiBriefcase, FiUser } from "react-icons/fi";
import Swal from "sweetalert2";
import { useMyProfile } from "../../store/useMyProfile";

const inputCls =
  "w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl font-semibold text-gray-700 outline-none focus:border-[#852BAF] focus:ring-2 focus:ring-purple-100 transition-all";

type Tab = "profile" | "password" | "notifications" | "business";

const tabs: { key: Tab; label: string; Icon: React.ElementType }[] = [
  { key: "profile", label: "Profile Settings", Icon: FiUser },
  { key: "password", label: "Password", Icon: FiLock },
  { key: "notifications", label: "Notification Settings", Icon: FiBell },
  { key: "business", label: "Business Information", Icon: FiBriefcase },
];

export default function SettingsPage() {
  const { profile, loading, updateProfile } = useMyProfile();
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [notifPrefs, setNotifPrefs] = useState({ email: true, sms: false, bookingAlerts: true });

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
      </div>
    );
  }

  const saveNotice = async () => {
    await Swal.fire({ title: "Saved!", icon: "success", timer: 1200, showConfirmButton: false });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0"
          style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 6px 20px rgba(133,43,175,0.25)" }}
        >
          <FiSettings size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Settings</h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">Manage your account preferences</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-gray-100">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === t.key
                ? "border-[#852BAF] text-[#852BAF]"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            <t.Icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
        {activeTab === "profile" && (
          <div className="space-y-4 max-w-md">
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Owner Name</label>
              <input
                defaultValue={profile.ownerName}
                onBlur={(e) => updateProfile({ ...profile, ownerName: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Email</label>
              <input
                defaultValue={profile.email}
                onBlur={(e) => updateProfile({ ...profile, email: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Phone</label>
              <input
                defaultValue={profile.phone}
                onBlur={(e) => updateProfile({ ...profile, phone: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>
        )}

        {activeTab === "password" && (
          <form
            className="space-y-4 max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              saveNotice();
            }}
          >
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Current Password</label>
              <input type="password" className={inputCls} placeholder="••••••••" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">New Password</label>
              <input type="password" className={inputCls} placeholder="••••••••" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Confirm New Password</label>
              <input type="password" className={inputCls} placeholder="••••••••" />
            </div>
            <button
              type="submit"
              className="px-6 py-3 font-black text-white bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-2xl cursor-pointer"
            >
              Update Password
            </button>
          </form>
        )}

        {activeTab === "notifications" && (
          <div className="space-y-4 max-w-md">
            {[
              { key: "email" as const, label: "Email notifications" },
              { key: "sms" as const, label: "SMS notifications" },
              { key: "bookingAlerts" as const, label: "Booking alerts" },
            ].map((n) => (
              <label
                key={n.key}
                className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl cursor-pointer"
              >
                <span className="text-sm font-semibold text-gray-700">{n.label}</span>
                <input
                  type="checkbox"
                  checked={notifPrefs[n.key]}
                  onChange={(e) => {
                    setNotifPrefs((prev) => ({ ...prev, [n.key]: e.target.checked }));
                    saveNotice();
                  }}
                  className="accent-[#852BAF] w-4 h-4"
                />
              </label>
            ))}
          </div>
        )}

        {activeTab === "business" && (
          <div className="space-y-4 max-w-md">
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">Business Name</label>
              <input
                defaultValue={profile.businessName}
                onBlur={(e) => updateProfile({ ...profile, businessName: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">GST</label>
              <input
                defaultValue={profile.gst}
                onBlur={(e) => updateProfile({ ...profile, gst: e.target.value.toUpperCase() })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-400 block mb-2">PAN</label>
              <input
                defaultValue={profile.pan}
                onBlur={(e) => updateProfile({ ...profile, pan: e.target.value.toUpperCase() })}
                className={inputCls}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
