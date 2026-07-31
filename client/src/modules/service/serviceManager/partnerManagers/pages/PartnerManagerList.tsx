import { Link } from "react-router-dom";
import { FiUsers, FiPlus } from "react-icons/fi";
import { usePartnerManagerRoutes } from "../../shared/useModuleRoutes";
import { usePartnerManagers } from "../store/usePartnerManagers";
import PartnerManagerTable from "../components/PartnerManagerTable";

export default function PartnerManagerList() {
  const partnerManagerRoutes = usePartnerManagerRoutes();
  const { managers, loading } = usePartnerManagers();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
        <span className="ml-4 text-gray-500 font-medium">Loading partner managers…</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div
        className="flex items-center justify-between p-5 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0"
            style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 6px 20px rgba(133,43,175,0.25)" }}
          >
            <FiUsers size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              Partner <span className="gradient-text-brand">Managers</span>
            </h1>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Regional managers overseeing service partner onboarding
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="px-3 py-1.5 rounded-xl text-xs font-bold"
            style={{ background: "rgba(133,43,175,0.07)", color: "#852BAF" }}
          >
            {managers.length} manager{managers.length !== 1 ? "s" : ""}
          </span>
          <Link to={partnerManagerRoutes.onboard}>
            <button
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white cursor-pointer transition-all hover:opacity-90 active:scale-95"
              style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
            >
              <FiPlus size={14} /> Add Manager
            </button>
          </Link>
        </div>
      </div>

      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}
      >
        <PartnerManagerTable managers={managers} />
      </div>
    </div>
  );
}
