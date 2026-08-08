import { FaCheckCircle, FaTimesCircle, FaClock } from "react-icons/fa";
import Chip from "../../../../common/components/StatusBadge";
import type { ServiceStatus, BookingStatus, BookingPaymentStatus } from "../types";

export function ServiceStatusChip({ status }: { status: ServiceStatus }) {
  return status === "active" ? (
    <Chip
      label="Active"
      cls="bg-emerald-50 text-emerald-700 border border-emerald-200"
      icon={<FaCheckCircle size={11} />}
    />
  ) : (
    <Chip
      label="Inactive"
      cls="bg-gray-100 text-gray-500 border border-gray-200"
      icon={<FaTimesCircle size={11} />}
    />
  );
}

const bookingMap: Record<BookingStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  upcoming: {
    label: "Upcoming",
    cls: "bg-blue-50 text-blue-700 border border-blue-200",
    icon: <FaClock size={11} />,
  },
  completed: {
    label: "Completed",
    cls: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    icon: <FaCheckCircle size={11} />,
  },
  cancelled: {
    label: "Cancelled",
    cls: "bg-red-50 text-red-700 border border-red-200",
    icon: <FaTimesCircle size={11} />,
  },
};

export function BookingStatusChip({ status }: { status: BookingStatus }) {
  const cfg = bookingMap[status];
  return <Chip label={cfg.label} cls={cfg.cls} icon={cfg.icon} />;
}

const paymentMap: Record<BookingPaymentStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  paid: {
    label: "Paid",
    cls: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    icon: <FaCheckCircle size={11} />,
  },
  pending: {
    label: "Pending",
    cls: "bg-amber-50 text-amber-700 border border-amber-200",
    icon: <FaClock size={11} />,
  },
  refunded: {
    label: "Refunded",
    cls: "bg-gray-100 text-gray-500 border border-gray-200",
    icon: <FaTimesCircle size={11} />,
  },
};

export function PaymentStatusChip({ status }: { status: BookingPaymentStatus }) {
  const cfg = paymentMap[status];
  return <Chip label={cfg.label} cls={cfg.cls} icon={cfg.icon} />;
}
