import { Link } from "react-router-dom";
import { FaEdit, FaMapMarkerAlt, FaPhone, FaEnvelope, FaIdCard } from "react-icons/fa";
import { FiUser } from "react-icons/fi";
import { routes } from "../../../../../routes";
import { useMyProfile } from "../../store/useMyProfile";

export default function MyProfile() {
  const { profile, loading } = useMyProfile();

  if (loading || !profile) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div
        className="flex items-center justify-between p-6 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-white text-2xl shrink-0 overflow-hidden"
            style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 6px 20px rgba(133,43,175,0.25)" }}
          >
            {profile.profileImage ? (
              <img src={profile.profileImage} alt={profile.businessName} className="w-full h-full object-cover" />
            ) : (
              profile.businessName.charAt(0).toUpperCase()
            )}
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">{profile.businessName}</h1>
            <p className="text-xs text-gray-500 font-medium mt-0.5">Owner: {profile.ownerName}</p>
            <span
              className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${
                profile.status === "active"
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : profile.status === "pending"
                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                    : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {profile.status}
            </span>
          </div>
        </div>

        <Link to={routes.servicePartner.onboarding}>
          <button
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white cursor-pointer transition-all hover:opacity-90 active:scale-95"
            style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
          >
            <FaEdit size={13} /> Edit Profile
          </button>
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
          <h2 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-4">Business Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Category</p>
              <p className="text-sm font-semibold text-gray-800">{profile.category}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Sub Category</p>
              <p className="text-sm font-semibold text-gray-800">{profile.subCategory}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">GST</p>
              <p className="text-sm font-semibold text-gray-800">{profile.gst}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">PAN</p>
              <p className="text-sm font-semibold text-gray-800">{profile.pan}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Joined Date</p>
              <p className="text-sm font-semibold text-gray-800">
                {new Date(profile.joinedDate).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Partner ID</p>
              <p className="text-sm font-semibold text-gray-800">{profile.partnerId}</p>
            </div>
          </div>

          <h2 className="text-sm font-black text-gray-700 uppercase tracking-wider mt-8 mb-4">Bank Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Account Holder</p>
              <p className="text-sm font-semibold text-gray-800">{profile.bank.accountHolder}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Bank Name</p>
              <p className="text-sm font-semibold text-gray-800">{profile.bank.bankName}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Account Number</p>
              <p className="text-sm font-semibold text-gray-800">{profile.bank.accountNumber}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">IFSC Code</p>
              <p className="text-sm font-semibold text-gray-800">{profile.bank.ifscCode}</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            <h2 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-4">Contact</h2>
            <div className="space-y-3 text-sm text-gray-700">
              <p className="flex items-center gap-2">
                <FaPhone className="text-gray-400" size={12} /> {profile.phone}
              </p>
              <p className="flex items-center gap-2">
                <FaEnvelope className="text-gray-400" size={12} /> {profile.email}
              </p>
              <p className="flex items-start gap-2">
                <FaMapMarkerAlt className="text-gray-400 mt-0.5" size={12} />
                <span>
                  {profile.address}, {profile.city}, {profile.state}
                </span>
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            <h2 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
              <FaIdCard className="text-gray-400" size={13} /> Owner
            </h2>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm bg-gradient-to-tr from-[#852BAF] to-[#FC3F78]">
                <FiUser size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{profile.ownerName}</p>
                <p className="text-xs text-gray-400">{profile.city}, {profile.state}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
