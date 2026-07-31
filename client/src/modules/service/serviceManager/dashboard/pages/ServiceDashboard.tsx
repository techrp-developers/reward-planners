import { FiGrid, FiHeart, FiUserCheck, FiCheckCircle, FiClock } from "react-icons/fi";
import { useServicePartners } from "../../servicePartners/store/useServicePartners";
import { usePartnerManagers } from "../../partnerManagers/store/usePartnerManagers";

function StatCard({
  label,
  value,
  Icon,
}: {
  label: string;
  value: number | string;
  Icon: React.ElementType;
}) {
  return (
    <div
      className="bg-white rounded-2xl p-6 flex items-center gap-4"
      style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0"
        style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
      >
        <Icon size={20} />
      </div>
      <div>
        <p className="text-2xl font-black text-gray-900 tracking-tight">{value}</p>
        <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-0.5">{label}</p>
      </div>
    </div>
  );
}

export default function ServiceDashboard() {
  const { partners, loading: partnersLoading } = useServicePartners();
  const { managers, loading: managersLoading } = usePartnerManagers();

  const activeCount = partners.filter((p) => p.status === "active").length;
  const pendingCount = partners.filter((p) => p.status === "pending").length;

  if (partnersLoading || managersLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
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
          <FiGrid size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            Services <span className="gradient-text-brand">Dashboard</span>
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Overview of service partners and partner managers
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <StatCard label="Total Partners" value={partners.length} Icon={FiHeart} />
        <StatCard label="Active Partners" value={activeCount} Icon={FiCheckCircle} />
        <StatCard label="Pending Approval" value={pendingCount} Icon={FiClock} />
        <StatCard label="Partner Managers" value={managers.length} Icon={FiUserCheck} />
      </div>
    </div>
  );
}
