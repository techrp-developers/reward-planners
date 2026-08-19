import { useEffect, useState } from "react";
import { FiUser, FiUsers, FiCheckCircle, FiInbox, FiGift } from "react-icons/fi";
import { FaUsers } from "react-icons/fa";
import { hrApi } from "../../../common/api/hrApi";

// Import your actual form components (these must exist in ./reward_management/)
import IndividualForm from "./reward_management/Individual";
import TeamForm from "./reward_management/Team";
import CompanyForm from "./reward_management/Company";

type DistributionType = "employee" | "team" | "all" | null;

export default function ManageRewards() {
  const [selectedType, setSelectedType] = useState<DistributionType>(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletLoading, setWalletLoading] = useState(true);

  useEffect(() => {
    hrApi
      .get("/company-wallet")
      .then((response) => setWalletBalance(Number(response.data?.data?.balance || 0)))
      .catch((error) => console.error("Unable to load company wallet:", error))
      .finally(() => setWalletLoading(false));
  }, []);

  const handleSelect = (type: DistributionType) => {
    setSelectedType((prev) => (prev === type ? null : type));
  };

  return (
    <div className="max-w-6xl p-4 mx-auto space-y-6 duration-700 md:p-6 md:space-y-8 animate-in fade-in">
      {/* HEADER SECTION */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-gray-900 md:text-3xl">
            Manage{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#852BAF] to-[#FC3F78]">
              Rewards
            </span>
          </h2>
          <p className="font-medium text-gray-500">
            Configure how incentives are distributed across your organization.
          </p>
        </div>
        <div className="flex items-center gap-4 px-5 py-4 text-white shadow-lg bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-2xl shadow-purple-500/30">
          <div className="p-2.5 rounded-xl bg-white/20">
            <FiGift className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-purple-100 uppercase">
              Reward Balance
            </p>
            <p className="text-2xl font-black">
              {walletLoading ? "..." : `${walletBalance.toLocaleString()} points`}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Custom Distribution</h3>
          <p className="text-sm text-gray-500">Select a target to begin reward allocation.</p>
        </div>

        {/* DISTRIBUTION CARDS */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <DistributionCard
            title="Individual"
            subtitle="Single Employee"
            icon={<FiUser className="w-6 h-6" />}
            color="rose"
            active={selectedType === "employee"}
            onClick={() => handleSelect("employee")}
          />

          <DistributionCard
            title="Team"
            subtitle="Departmental"
            icon={<FiUsers className="w-6 h-6" />}
            color="indigo"
            active={selectedType === "team"}
            onClick={() => handleSelect("team")}
          />

          <DistributionCard
            title="Company"
            subtitle="Organization Wide"
            icon={<FaUsers className="w-6 h-6" />}
            color="amber"
            active={selectedType === "all"}
            onClick={() => handleSelect("all")}
          />
        </div>

        {/* DYNAMIC CONTENT AREA */}
        <div className="bg-white border border-gray-100 shadow-2xl shadow-gray-200/40 rounded-3xl overflow-hidden min-h-[450px] transition-all duration-500">
          {selectedType ? (
            <div
              key={selectedType}
              className="p-5 duration-500 md:p-8 animate-in fade-in slide-in-from-bottom-4"
            >
              <div className="flex items-center justify-between pb-4 mb-8 border-b border-gray-50">
                <span className="inline-flex items-center gap-2 text-xs font-bold tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-[#852BAF] to-[#FC3F78]">
                  {selectedType === "employee"
                    ? "Individual"
                    : selectedType === "team"
                      ? "Team"
                      : "Company"}{" "}
                  Configuration
                </span>
                <button
                  onClick={() => setSelectedType(null)}
                  className="text-xs font-semibold text-gray-400 underline transition-colors cursor-pointer hover:text-gray-600"
                >
                  Clear Selection
                </button>
              </div>

              {selectedType === "employee" && (
                <IndividualForm onAwardComplete={setWalletBalance} />
              )}
              {selectedType === "team" && (
                <TeamForm onAwardComplete={setWalletBalance} />
              )}
              {selectedType === "all" && (
                <CompanyForm onAwardComplete={setWalletBalance} />
              )}
            </div>
          ) : (
            /* EMPTY STATE */
            <div className="flex flex-col items-center justify-center h-[450px] text-center p-8 md:p-12 animate-in fade-in zoom-in-95 duration-700">
              <div className="flex items-center justify-center w-20 h-20 mb-4 rounded-full bg-gradient-to-br from-purple-50 to-pink-50">
                <FiInbox className="w-10 h-10 text-purple-200" />
              </div>
              <h4 className="font-bold text-gray-900">No Distribution Selected</h4>
              <p className="text-gray-400 text-sm max-w-[240px] mt-2">
                Please select Individual, Team, or Company above to configure rewards.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= DISTRIBUTION CARD COMPONENT ================= */
interface CardProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  active: boolean;
  color: "rose" | "indigo" | "amber";
  onClick: () => void;
}

const cardTheme = {
  rose: {
    icon: "bg-rose-100 text-rose-500",
    iconActive: "bg-rose-500 text-white",
    border: "border-rose-500",
    shadow: "shadow-rose-100",
    check: "text-rose-500",
  },
  indigo: {
    icon: "bg-indigo-100 text-indigo-500",
    iconActive: "bg-indigo-500 text-white",
    border: "border-indigo-500",
    shadow: "shadow-indigo-100",
    check: "text-indigo-500",
  },
  amber: {
    icon: "bg-amber-100 text-amber-600",
    iconActive: "bg-amber-500 text-white",
    border: "border-amber-500",
    shadow: "shadow-amber-100",
    check: "text-amber-500",
  },
} as const;

function DistributionCard({ title, subtitle, icon, active, color, onClick }: CardProps) {
  const theme = cardTheme[color];

  return (
    <div
      onClick={onClick}
      className={`
        relative overflow-hidden cursor-pointer p-6 rounded-3xl border-2 transition-all duration-500
        flex flex-col gap-4 group
        ${
          active
            ? `${theme.border} bg-white shadow-2xl ${theme.shadow} -translate-y-2`
            : "border-transparent bg-white shadow-sm hover:shadow-md hover:border-gray-200 hover:-translate-y-1"
        }
      `}
    >
      <div
        className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${
          active ? theme.iconActive : theme.icon
        }`}
      >
        {icon}
      </div>

      <div>
        <h4 className="font-bold text-gray-900">{title}</h4>
        <p className="text-xs text-gray-500 group-hover:text-gray-700">{subtitle}</p>
      </div>

      {active && (
        <div className="absolute duration-500 top-4 right-4 animate-in fade-in zoom-in spin-in-12">
          <FiCheckCircle className={`w-5 h-5 ${theme.check}`} />
        </div>
      )}
    </div>
  );
}
