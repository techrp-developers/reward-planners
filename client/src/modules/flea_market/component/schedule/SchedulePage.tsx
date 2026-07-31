import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
  const queryClient = useQueryClient();
  const redirectMessage = (location.state as { message?: string } | null)?.message;

  const [date, setDate] = useState(todayDateString());
  const [showForm, setShowForm] = useState(false);

  // Date is part of the query key — switching the date picker is a genuinely
  // different data set, not a re-render of the same one, so it must cache
  // (and invalidate) independently per date.
  const schedulesQuery = useQuery({
    queryKey: ["flea-market", "schedules", { date }],
    queryFn: () => listSchedules(date),
  });

  const invalidateSchedules = () => {
    void queryClient.invalidateQueries({ queryKey: ["flea-market", "schedules"] });
  };

  const handleCreated = () => {
    setShowForm(false);
    invalidateSchedules();
  };

  const statusMutation = useMutation({
    mutationFn: ({ scheduleId, status }: { scheduleId: number; status: ScheduleStatus }) =>
      updateScheduleStatus(scheduleId, status),
    onSuccess: invalidateSchedules,
    onError: (err) => {
      console.error("Failed to update schedule status:", err);
      toast.error("Unable to update that schedule entry.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (scheduleId: number) => deleteSchedule(scheduleId),
    onSuccess: invalidateSchedules,
    onError: (err) => {
      console.error("Failed to delete schedule entry:", err);
      toast.error("Unable to delete that schedule entry.");
    },
  });

  const handleStatusChange = (scheduleId: number, status: ScheduleStatus) => {
    statusMutation.mutate({ scheduleId, status });
  };

  const handleDelete = (scheduleId: number) => {
    const confirmed = window.confirm("Delete this schedule entry?");
    if (!confirmed) return;
    deleteMutation.mutate(scheduleId);
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
  const schedules = schedulesQuery.data ?? [];

  return (
    <div className="space-y-6">
      {redirectMessage && (
        <div className="flex items-center gap-2 p-3 text-sm border text-amber-800 border-amber-200 rounded-xl bg-amber-50">
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
            className="px-3 py-2 text-sm bg-white border rounded-lg outline-none border-slate-200"
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

      {schedulesQuery.isLoading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
          <span className="w-4 h-4 border-2 border-purple-200 rounded-full animate-spin border-t-purple-600" />
          Loading events...
        </div>
      )}

      {!schedulesQuery.isLoading && schedulesQuery.isError && (
        <div className="flex items-center justify-between gap-2 p-3 text-sm text-red-700 border border-red-200 rounded-xl bg-red-50">
          <span className="flex items-center gap-2">
            <FiAlertCircle className="w-4 h-4 shrink-0" />
            Unable to load the schedule right now.
          </span>
          <button
            type="button"
            onClick={() => void schedulesQuery.refetch()}
            className="flex items-center gap-1 text-xs font-bold text-red-700 underline shrink-0 hover:text-red-900"
          >
            <FiRefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {!schedulesQuery.isLoading && !schedulesQuery.isError && schedules.length === 0 && (
        <p className="py-10 text-sm text-center text-gray-400">No events for {date}.</p>
      )}

      {!schedulesQuery.isLoading && !schedulesQuery.isError && schedules.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {schedules.map((schedule) => (
            <ScheduleCard
              key={schedule.scheduleId}
              schedule={schedule}
              isToday={isToday}
              busy={
                (statusMutation.isPending && statusMutation.variables?.scheduleId === schedule.scheduleId) ||
                (deleteMutation.isPending && deleteMutation.variables === schedule.scheduleId)
              }
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
              onStartBilling={handleStartBilling}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default SchedulePage;
