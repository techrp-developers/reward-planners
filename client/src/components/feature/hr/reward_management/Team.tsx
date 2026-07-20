import { useEffect, useMemo, useState } from "react";
import { FiUsers, FiLayers, FiChevronDown, FiAlertCircle } from "react-icons/fi";
import Swal from "sweetalert2";
import { hrApi } from "../../../../api/hrApi";

interface Employee {
  id: number;
  name: string;
  email: string | null;
  department: string | null;
  role: string | null;
}

export default function TeamForm({
  onAwardComplete,
}: {
  onAwardComplete?: (balance: number) => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [department, setDepartment] = useState("");
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    hrApi
      .get("/employees", { params: { status: "active", limit: 500 } })
      .then((response) => setEmployees(response.data?.data || []))
      .catch((error) => console.error("Unable to load team members:", error))
      .finally(() => setLoading(false));
  }, []);

  const departments = useMemo(
    () => [...new Set(employees.map((employee) => employee.department).filter(Boolean))].sort() as string[],
    [employees],
  );
  const members = useMemo(
    () => employees.filter((employee) => employee.department === department),
    [employees, department],
  );
  const pointValue = Number(points) || 0;
  const totalCost = pointValue * members.length;

  const distribute = async () => {
    if (!department || !members.length) {
      await Swal.fire("Select a department", "Choose a department with active employees.", "warning");
      return;
    }
    if (!Number.isSafeInteger(pointValue) || pointValue <= 0) {
      await Swal.fire("Invalid points", "Enter positive whole-number points per employee.", "warning");
      return;
    }

    try {
      setSubmitting(true);
      const response = await hrApi.post("/company-wallet/award", {
        employee_ids: members.map((member) => member.id),
        points: pointValue,
        title: `${department} Team Reward`,
        description: note,
      });
      onAwardComplete?.(Number(response.data?.data?.balance || 0));
      await Swal.fire(
        "Team rewarded",
        `${pointValue.toLocaleString()} points were awarded to ${members.length} employees.`,
        "success",
      );
      setPoints("");
      setNote("");
    } catch (error: any) {
      const code = error.response?.data?.code;
      await Swal.fire(
        code === "CUSTOMER_NOT_ONBOARDED" ? "Customer onboarding required" : "Unable to reward team",
        error.response?.data?.message || "Please try again.",
        code === "CUSTOMER_NOT_ONBOARDED" ? "warning" : "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-7 duration-500 animate-in fade-in slide-in-from-bottom-2">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-bold text-gray-700">Target Department</span>
          <span className="relative block">
            <FiLayers className="absolute text-gray-400 left-4 top-3.5" />
            <select
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              disabled={loading}
              className="w-full py-3 pl-11 pr-10 font-medium text-gray-900 transition-all border border-gray-100 outline-none appearance-none cursor-pointer bg-gray-50 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              <option value="">{loading ? "Loading departments..." : "Select a Department"}</option>
              {departments.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <FiChevronDown className="absolute text-gray-400 pointer-events-none right-4 top-3.5" />
          </span>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-bold text-gray-700">Points per Employee</span>
          <input
            type="number"
            min="1"
            step="1"
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            placeholder="Enter points"
            className="w-full px-4 py-3 font-medium text-gray-900 transition-all border border-gray-100 outline-none bg-gray-50 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </label>
      </div>

      <div className="overflow-hidden border border-gray-100 rounded-2xl">
        <div className="flex items-center justify-between p-4 bg-indigo-50/50">
          <span className="text-sm font-bold text-gray-700">Active Members</span>
          <span className="text-xs font-bold text-indigo-600">{members.length} recipients</span>
        </div>
        <div className="overflow-y-auto divide-y divide-gray-50 max-h-60">
          {!department ? (
            <p className="p-6 text-sm text-center text-gray-400">Select a department to view members</p>
          ) : members.length === 0 ? (
            <p className="p-6 text-sm text-center text-gray-400">No active employees found</p>
          ) : members.map((member) => (
            <div key={member.id} className="flex items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex items-center justify-center w-9 h-9 text-sm font-bold text-indigo-600 bg-indigo-100 rounded-full shrink-0">
                  {member.name?.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{member.name}</p>
                  <p className="text-xs text-gray-400 truncate">{member.role || "Employee"} · {member.email || "No email"}</p>
                </div>
              </div>
              <span className="text-sm font-bold text-indigo-600 shrink-0">{pointValue.toLocaleString()} pts</span>
            </div>
          ))}
        </div>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-bold text-gray-700">Appreciation Note (Optional)</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="w-full px-4 py-3 font-medium text-gray-900 transition-all border border-gray-100 outline-none resize-none bg-gray-50 rounded-2xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500" />
      </label>

      <div className="flex items-center justify-between p-4 border border-amber-100 bg-amber-50/50 rounded-2xl">
        <span className="flex items-center gap-2 text-sm text-amber-800"><FiAlertCircle /> Total wallet deduction</span>
        <strong className="text-amber-700">{totalCost.toLocaleString()} points</strong>
      </div>

      <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-50">
        <button
          type="button"
          onClick={() => {
            setDepartment("");
            setPoints("");
            setNote("");
          }}
          className="px-6 py-2.5 text-sm font-semibold text-gray-500 transition-colors cursor-pointer hover:text-gray-700"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={() => void distribute()}
          disabled={submitting || !members.length}
          className="flex items-center gap-2 px-8 py-3 bg-gray-900 text-white text-sm font-bold rounded-2xl shadow-lg shadow-gray-200 hover:bg-black hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
          <FiUsers className="w-4 h-4" /> {submitting ? "Distributing..." : "Distribute to Team"}
        </button>
      </div>
    </div>
  );
}
