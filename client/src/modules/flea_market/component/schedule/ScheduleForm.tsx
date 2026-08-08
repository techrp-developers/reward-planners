import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { FiAlertCircle, FiX } from "react-icons/fi";
import { listFleaMarketCompanies, type FleaMarketCompany } from "../../api/fleaMarketCompaniesApi";
import { fetchFleaMarketLocations, type FleaMarketLocation } from "../../api/fleaMarketLocationsApi";
import { createSchedule, type CreateSchedulePayload } from "../../api/fleaMarketScheduleApi";

interface ScheduleFormProps {
  defaultDate: string;
  onCreated: () => void;
  onClose: () => void;
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function ScheduleForm({ defaultDate, onCreated, onClose }: ScheduleFormProps) {
  const [companies, setCompanies] = useState<FleaMarketCompany[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);

  const [companyId, setCompanyId] = useState<number | "">("");
  const [locations, setLocations] = useState<FleaMarketLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  // Free text now — matched against existing locations by name on the backend,
  // which creates a new location row if nothing matches (see scheduleService.js).
  const [locationName, setLocationName] = useState("");

  const [scheduledDate, setScheduledDate] = useState(defaultDate || todayDateString());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Company dropdown, loaded once.
  useEffect(() => {
    let ignore = false;

    (async () => {
      try {
        setCompaniesLoading(true);
        const rows = await listFleaMarketCompanies();
        if (!ignore) setCompanies(rows);
      } catch (err) {
        console.error("Failed to load companies:", err);
        if (!ignore) setError("Unable to load companies right now.");
      } finally {
        if (!ignore) setCompaniesLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, []);

  // Location dropdown, re-fetched whenever the selected company changes —
  // location selection now happens here at scheduling time, not at billing time.
  useEffect(() => {
    setLocationName("");

    if (companyId === "") {
      setLocations([]);
      return;
    }

    let ignore = false;

    (async () => {
      try {
        setLocationsLoading(true);
        const rows = await fetchFleaMarketLocations(companyId);
        if (!ignore) setLocations(rows);
      } catch (err) {
        console.error("Failed to load locations:", err);
        if (!ignore) setError("Unable to load locations for this company.");
      } finally {
        if (!ignore) setLocationsLoading(false);
      }
    })();

    return () => {
      ignore = true;
    };
  }, [companyId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (companyId === "" || !scheduledDate) {
      setError("Company and date are required.");
      return;
    }

    const payload: CreateSchedulePayload = {
      companyId,
      locationName: locationName.trim(),
      scheduledDate,
      ...(startTime ? { startTime } : {}),
      ...(endTime ? { endTime } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    try {
      setSubmitting(true);
      await createSchedule(payload);
      onCreated();
    } catch (err) {
      console.error("Failed to create schedule entry:", err);
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Failed to create schedule entry.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 bg-white border border-gray-100 shadow-md rounded-2xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-900">Add Event</h3>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <FiX className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-slate-700">Company</label>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : "")}
            disabled={companiesLoading}
            className="w-full px-3 py-2 mt-1 text-sm bg-white border rounded-lg outline-none border-slate-200"
          >
            <option value="">{companiesLoading ? "Loading companies..." : "Select a company"}</option>
            {companies.map((company) => (
              <option key={company.companyId} value={company.companyId}>
                {company.companyName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700">
            Location <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            list="location-options"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            disabled={companyId === "" || locationsLoading}
            placeholder={
              companyId === ""
                ? "Select a company first"
                : locationsLoading
                  ? "Loading locations..."
                  : "Select or type a location"
            }
            className="w-full px-3 py-2 mt-1 text-sm bg-white border rounded-lg outline-none border-slate-200 disabled:bg-gray-50"
          />
          <datalist id="location-options">
            {locations.map((location) => (
              <option key={location.locationId} value={location.name} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-700">Date</label>
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="w-full px-3 py-2 mt-1 text-sm bg-white border rounded-lg outline-none border-slate-200"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">Start Time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3 py-2 mt-1 text-sm bg-white border rounded-lg outline-none border-slate-200"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700">End Time</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3 py-2 mt-1 text-sm bg-white border rounded-lg outline-none border-slate-200"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700">
            Notes <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={255}
            rows={2}
            className="w-full px-3 py-2 mt-1 text-sm bg-white border rounded-lg outline-none border-slate-200"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-red-700 border border-red-200 rounded-xl bg-red-50">
            <FiAlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 text-sm font-bold text-white rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-md shadow-purple-500/20 transition-all disabled:opacity-60"
        >
          {submitting ? "Saving..." : "Add Event"}
        </button>
      </form>
    </div>
  );
}

export default ScheduleForm;
