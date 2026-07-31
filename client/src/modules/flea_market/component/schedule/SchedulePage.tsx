import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiAlertCircle, FiCalendar, FiPlus, FiRefreshCw } from "react-icons/fi";
import { routes } from "../../../../routes";
import {
  deleteSchedule,
  listSchedules,
  updateScheduleStatus,
  type FleaMarketSchedule,
  type ScheduleStatus,
} from "../../api/fleaMarketScheduleApi";
import ScheduleCard from "./ScheduleCard";
import ScheduleForm from "./ScheduleForm";

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

interface BillingNavState {
  companyId: number;
  companyName: string;
  locationId: number;
  locationName: string;
  scheduleId: number;
}

function SchedulePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectMessage = (location.state as { message?: string } | null)?.message;

  const [date, setDate] = useState(todayDateString());
  const [schedules, setSchedules] = useState<FleaMarketSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadSchedules = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const rows = await listSchedules(date);
      setSchedules(rows);
    } catch (err) {
      console.error("Failed to load schedules:", err);
      setError("Unable to load the schedule right now.");
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  const handleCreated = () => {
    setShowForm(false);
    void loadSchedules();
  };

  const handleStatusChange = async (scheduleId: number, status: ScheduleStatus) => {
    try {
      setBusyId(scheduleId);
      await updateScheduleStatus(scheduleId, status);
      await loadSchedules();
    } catch (err) {
      console.error("Failed to update schedule status:", err);
      setError("Unable to update that schedule entry.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (scheduleId: number) => {
    const confirmed = window.confirm("Delete this schedule entry?");
    if (!confirmed) return;

    try {
      setBusyId(scheduleId);
      await deleteSchedule(scheduleId);
      await loadSchedules();
    } catch (err) {
      console.error("Failed to delete schedule entry:", err);
      setError("Unable to delete that schedule entry.");
    } finally {
      setBusyId(null);
    }
  };

  const handleStartBilling = (schedule: FleaMarketSchedule) => {
    const state: BillingNavState = {
      companyId: schedule.companyId,
      companyName: schedule.companyName,
      locationId: schedule.locationId,
      locationName: schedule.locationName,
      scheduleId: schedule.scheduleId,
    };
    navigate(routes.fleaMarket.billing.page, { state });
  };

  const isToday = date === todayDateString();

  return (
    <div className="space-y-6">
      {redirectMessage && (
        <div className="flex items-center gap-2 p-3 text-sm text-amber-800 border border-amber-200 rounded-xl bg-amber-50">
          <FiAlertCircle className="w-4 h-4 shrink-0" />
          {redirectMessage}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-white border border-gray-100 shadow-md rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-xl">
            <FiCalendar className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Manage Event</h1>
            <p className="text-sm text-gray-500">Which company runs a flea market, where, and when.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none"
          />
          <button
            type="button"
            onClick={() => setShowForm((prev) => !prev)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20"
          >
            <FiPlus className="w-4 h-4" />
            Add Event
          </button>
        </div>
      </div>

      {showForm && <ScheduleForm defaultDate={date} onCreated={handleCreated} onClose={() => setShowForm(false)} />}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
          <span className="w-4 h-4 border-2 border-purple-200 rounded-full animate-spin border-t-purple-600" />
          Loading events...
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center justify-between gap-2 p-3 text-sm text-red-700 border border-red-200 rounded-xl bg-red-50">
          <span className="flex items-center gap-2">
            <FiAlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </span>
          <button
            type="button"
            onClick={() => void loadSchedules()}
            className="flex items-center gap-1 text-xs font-bold text-red-700 underline shrink-0 hover:text-red-900"
          >
            <FiRefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {!loading && !error && schedules.length === 0 && (
        <p className="py-10 text-sm text-center text-gray-400">No events for {date}.</p>
      )}

      {!loading && !error && schedules.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.scheduleId}
              schedule={schedule}
              isToday={isToday}
              busy={busyId === schedule.scheduleId}
              onStatusChange={(scheduleId, status) => void handleStatusChange(scheduleId, status)}
              onDelete={(scheduleId) => void handleDelete(scheduleId)}
              onStartBilling={handleStartBilling}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default SchedulePage;
