import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FaStar, FaPhone, FaEnvelope, FaMapMarkerAlt, FaEdit } from "react-icons/fa";
import { FiArrowLeft, FiUser } from "react-icons/fi";
import { useServicePartnerRoutes } from "../../shared/useModuleRoutes";
import { servicePartnersApi } from "../api/servicePartnersApi";
import { usePartnerManagers } from "../../partnerManagers/store/usePartnerManagers";
import StatusChip from "../components/StatusChip";
import type { ServicePartner } from "../types";

export default function ServicePartnerProfile() {
  const { id } = useParams<{ id: string }>();
  const servicePartnerRoutes = useServicePartnerRoutes();
  const { managers } = usePartnerManagers();
  const [partner, setPartner] = useState<ServicePartner | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const res = await servicePartnersApi.getById(id);
      if (res.data.success) setPartner(res.data.data);
      setLoading(false);
    })();
  }, [id]);

  const manager = managers.find((m) => m.managerId === partner?.managedBy);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
      </div>
    );
  }

  if (!partner) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center">
        <h2 className="text-xl font-bold text-gray-700">Service partner not found</h2>
        <Link to={servicePartnerRoutes.list} className="text-[#852BAF] font-semibold mt-2 inline-block">
          Back to list
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-8">
      <Link
        to={servicePartnerRoutes.list}
        className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-[#852BAF]"
      >
        <FiArrowLeft /> Back to Service Partners
      </Link>

      <div
        className="flex items-center justify-between p-6 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-white text-xl shrink-0"
            style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 6px 20px rgba(133,43,175,0.25)" }}
          >
            {partner.partnerName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">{partner.partnerName}</h1>
            <p className="text-xs text-gray-500 font-medium mt-0.5">{partner.partnerCode}</p>
            <div className="flex items-center gap-2 mt-2">
              <StatusChip status={partner.status} />
              <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-600">
                <FaStar className="text-amber-400" size={12} /> {partner.rating.toFixed(1)}
              </span>
            </div>
          </div>
        </div>

        <Link to={servicePartnerRoutes.edit.replace(":id", partner.partnerId)}>
          <button
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white cursor-pointer transition-all hover:opacity-90 active:scale-95"
            style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
          >
            <FaEdit size={13} /> Edit Partner
          </button>
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
          <h2 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-4">Rate Card</h2>
          <div className="divide-y divide-gray-50">
            {partner.services.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <span className="text-sm font-semibold text-gray-700">{s.label}</span>
                <span className="text-sm font-bold text-[#852BAF]">₹{s.rate.toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>

          <h2 className="text-sm font-black text-gray-700 uppercase tracking-wider mt-8 mb-4">Category</h2>
          <p className="text-sm text-gray-700">
            {partner.category} <span className="text-gray-400">/</span> {partner.subCategory}
          </p>
          <p className="text-xs text-gray-400 mt-1">Onboarded on {new Date(partner.onboardedOn).toLocaleDateString()}</p>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            <h2 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-4">Contact</h2>
            <div className="space-y-3 text-sm text-gray-700">
              <p className="flex items-center gap-2">
                <FaPhone className="text-gray-400" size={12} /> {partner.contact.phone}
              </p>
              <p className="flex items-center gap-2">
                <FaEnvelope className="text-gray-400" size={12} /> {partner.contact.email}
              </p>
              <p className="flex items-start gap-2">
                <FaMapMarkerAlt className="text-gray-400 mt-0.5" size={12} />
                <span>
                  {partner.contact.address}, {partner.city}
                </span>
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)]">
            <h2 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-4">Partner Manager</h2>
            {manager ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm bg-gradient-to-tr from-[#852BAF] to-[#FC3F78]">
                  {manager.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{manager.name}</p>
                  <p className="text-xs text-gray-400">{manager.region}</p>
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-gray-400 italic">
                <FiUser /> Unassigned
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
