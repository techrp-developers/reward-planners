import { Link } from "react-router-dom";
import { FiBox, FiCalendar, FiClock, FiMapPin, FiPlayCircle, FiTrash2, FiXCircle } from "react-icons/fi";
import { routes } from "../../../../routes";
import type { FleaMarketSchedule, ScheduleStatus } from "../../api/fleaMarketScheduleApi";

interface ScheduleCardProps {
  schedule: FleaMarketSchedule;
  isToday: boolean;
  busy: boolean;
  onStatusChange: (scheduleId: number, status: ScheduleStatus) => void;
  onDelete: (scheduleId: number) => void;
  onStartBilling: (schedule: FleaMarketSchedule) => void;
}

const STATUS_BADGE: Record<ScheduleStatus, string> = {
  scheduled: "bg-gray-100 text-gray-600",
  in_progress: "bg-emerald-100 text-emerald-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<ScheduleStatus, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatTimeRange(startTime: string | null, endTime: string | null): string {
  if (!startTime && !endTime) return "No time set";
  const trim = (t: string) => t.slice(0, 5);
  if (startTime && endTime) return `${trim(startTime)} – ${trim(endTime)}`;
  return trim(startTime ?? endTime ?? "");
}

function ScheduleCard({ schedule, isToday, busy, onStatusChange, onDelete, onStartBilling }: ScheduleCardProps) {
  const canStartBilling = isToday && (schedule.status === "scheduled" || schedule.status === "in_progress");

  return (
    <div className="p-4 bg-white border border-gray-100 shadow-sm rounded-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-gray-900">{schedule.companyName}</p>
          <p className="flex items-center gap-1 mt-1 text-xs text-gray-500">
            <FiMapPin className="w-3 h-3" />
            {schedule.locationName}
          </p>
          <p className="flex items-center gap-1 mt-1 text-xs text-gray-500">
            <FiClock className="w-3 h-3" />
            {formatTimeRange(schedule.startTime, schedule.endTime)}
          </p>
          <p className="flex items-center gap-1 mt-1 text-xs text-gray-400">
            <FiCalendar className="w-3 h-3" />
            {schedule.scheduledDate}
          </p>
          {schedule.notes && <p className="mt-2 text-xs italic text-gray-400">{schedule.notes}</p>}
        </div>

        <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${STATUS_BADGE[schedule.status]}`}>
          {STATUS_LABEL[schedule.status]}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        {canStartBilling && (
          <button
            type="button"
            onClick={() => onStartBilling(schedule)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white rounded-lg bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88]"
          >
            <FiPlayCircle className="w-3.5 h-3.5" />
            Start Billing
          </button>
        )}

        {(schedule.status === "scheduled" || schedule.status === "in_progress") && (
          <Link
            to={`${routes.fleaMarket.allocations}?schedule_id=${schedule.scheduleId}`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-50"
          >
            <FiBox className="w-3.5 h-3.5" />
            Allocate Stock
          </Link>
        )}

        {schedule.status === "scheduled" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatusChange(schedule.scheduleId, "in_progress")}
            className="px-3 py-1.5 text-xs font-bold text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-50"
          >
            Mark In Progress
          </button>
        )}

        {schedule.status === "in_progress" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatusChange(schedule.scheduleId, "completed")}
            className="px-3 py-1.5 text-xs font-bold text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50"
          >
            Mark Completed
          </button>
        )}

        {(schedule.status === "scheduled" || schedule.status === "in_progress") && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatusChange(schedule.scheduleId, "cancelled")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
          >
            <FiXCircle className="w-3.5 h-3.5" />
            Cancel
          </button>
        )}

        {schedule.status === "scheduled" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onDelete(schedule.scheduleId)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <FiTrash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export default ScheduleCard;
