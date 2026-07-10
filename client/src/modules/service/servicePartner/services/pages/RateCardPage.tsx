import { FiCreditCard, FiHome } from "react-icons/fi";
import { useMyServices } from "../../store/useMyServices";
import { ServiceStatusChip } from "../../components/StatusChips";

export default function RateCardPage() {
  const { services, loading } = useMyServices();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div
        className="flex items-center gap-4 p-5 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0"
          style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 6px 20px rgba(133,43,175,0.25)" }}
        >
          <FiCreditCard size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            Rate <span className="gradient-text-brand">Card</span>
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">Base and offer pricing for your services</p>
        </div>
      </div>

      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}
      >
        <table className="min-w-full">
          <thead>
            <tr style={{ background: "linear-gradient(90deg, rgba(133,43,175,0.04) 0%, rgba(252,63,120,0.02) 100%)" }}>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Service</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Base Price</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Offer Price</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Duration</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Home Visit</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {services.map((s) => {
              const offerPrice = s.discount ? Math.round(s.price * (1 - s.discount / 100)) : s.price;
              return (
                <tr key={s.serviceId} className="hover:bg-purple-50/20 transition-colors">
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900">{s.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 line-through">
                    ₹{s.price.toLocaleString("en-IN")}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-[#852BAF]">
                    ₹{offerPrice.toLocaleString("en-IN")}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{s.duration}</td>
                  <td className="px-6 py-4">
                    {s.homeVisit ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                        <FiHome size={12} /> Available
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Not available</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <ServiceStatusChip status={s.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
