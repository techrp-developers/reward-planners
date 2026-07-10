import { FaCheckCircle, FaTimesCircle, FaClock } from "react-icons/fa";
import StatusBadge from "../../../../../common/components/StatusBadge";
import type { ServicePartnerStatus } from "../types";

const map: Record<ServicePartnerStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  active: {
    label: "Active",
    cls: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    icon: <FaCheckCircle className="shrink-0" size={11} />,
  },
  pending: {
    label: "Pending",
    cls: "bg-amber-50 text-amber-700 border border-amber-200",
    icon: <FaClock className="shrink-0" size={11} />,
  },
  suspended: {
    label: "Suspended",
    cls: "bg-red-50 text-red-700 border border-red-200",
    icon: <FaTimesCircle className="shrink-0" size={11} />,
  },
};

export default function StatusChip({ status }: { status: ServicePartnerStatus }) {
  const cfg = map[status];
  return <StatusBadge label={cfg.label} cls={cfg.cls} icon={cfg.icon} />;
}
