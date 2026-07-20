import React, { useEffect, useMemo, useState } from "react";
import { FiSearch, FiAlertCircle, FiCheck, FiUser } from "react-icons/fi";
import { hrApi } from "../../../../api/hrApi";
import Swal from "sweetalert2";

interface ActiveEmployee {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  role: string | null;
  status: "active";
}

const rewardTitles: Record<string, string> = {
  spot: "Spot Award",
  performance: "Performance Bonus",
  referral: "Referral Bonus",
  retention: "Retention Incentive",
};

const IndividualForm: React.FC<{ onAwardComplete?: (balance: number) => void }> = ({
  onAwardComplete,
}) => {
  const [employees, setEmployees] = useState<ActiveEmployee[]>([]);
  const [search, setSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<ActiveEmployee | null>(null);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [points, setPoints] = useState("");
  const [category, setCategory] = useState("spot");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    hrApi
      .get("/employees", { params: { status: "active", limit: 500 } })
      .then((response) => setEmployees(response.data?.data || []))
      .catch((error) => console.error("Unable to load active employees:", error))
      .finally(() => setLoadingEmployees(false));
  }, []);

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return employees;
    return employees.filter((employee) =>
      [employee.name, employee.email, employee.department, employee.role, String(employee.id)]
        .some((value) => (value || "").toLowerCase().includes(term)),
    );
  }, [employees, search]);

  const assignReward = async () => {
    const rewardPoints = Number(points);
    if (!selectedEmployee) {
      await Swal.fire("Select an employee", "Please select an employee first.", "warning");
      return;
    }
    if (!Number.isSafeInteger(rewardPoints) || rewardPoints <= 0) {
      await Swal.fire("Invalid points", "Enter a positive whole-number point amount.", "warning");
      return;
    }

    try {
      setSubmitting(true);
      const response = await hrApi.post("/company-wallet/award", {
        employee_id: selectedEmployee.id,
        points: rewardPoints,
        title: rewardTitles[category],
        description: note,
      });
      onAwardComplete?.(Number(response.data?.data?.balance || 0));
      await Swal.fire(
        "Points awarded",
        `${rewardPoints.toLocaleString()} points were credited to ${selectedEmployee.name}.`,
        "success",
      );
      setPoints("");
      setNote("");
      setSelectedEmployee(null);
      setSearch("");
    } catch (error: any) {
      const code = error.response?.data?.code;
      const title = code === "CUSTOMER_NOT_ONBOARDED"
        ? "Customer onboarding required"
        : "Unable to award points";
      await Swal.fire(
        title,
        error.response?.data?.message || "Please try again.",
        code === "CUSTOMER_NOT_ONBOARDED" ? "warning" : "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 duration-500 animate-in fade-in slide-in-from-bottom-2">
      {/* SECTION 1: SEARCH EMPLOYEE */}
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
          Select Employee
        </label>
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
            <FiSearch className="text-gray-400 transition-colors group-focus-within:text-purple-500" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, email or employee ID..."
            className="w-full py-3 pr-4 font-medium text-gray-900 transition-all border border-gray-100 outline-none pl-11 bg-gray-50 rounded-2xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 placeholder:text-gray-400"
          />
        </div>
        <div className="overflow-y-auto border border-gray-100 divide-y divide-gray-50 max-h-64 rounded-2xl">
          {loadingEmployees ? (
            <div className="p-6 text-sm text-center text-gray-400">Loading active employees...</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="p-6 text-sm text-center text-gray-400">No active employees found</div>
          ) : (
            filteredEmployees.map((employee) => {
              const selected = selectedEmployee?.id === employee.id;
              return (
                <button
                  type="button"
                  key={employee.id}
                  onClick={() => setSelectedEmployee(employee)}
                  className={`flex w-full items-center justify-between p-4 text-left transition-colors ${
                    selected ? "bg-purple-50" : "bg-white hover:bg-gray-50"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-10 h-10 text-sm font-bold text-purple-600 bg-purple-100 rounded-full">
                      {employee.name?.charAt(0).toUpperCase() || <FiUser />}
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-gray-800">{employee.name}</span>
                      <span className="block mt-0.5 text-xs text-gray-400">
                        {employee.email || "No email"} · {employee.department || "No department"}
                      </span>
                    </span>
                  </span>
                  {selected && <FiCheck className="w-5 h-5 text-purple-600" />}
                </button>
              );
            })
          )}
        </div>
        {selectedEmployee && (
          <p className="text-xs font-semibold text-emerald-600">
            Selected: {selectedEmployee.name} ({selectedEmployee.role || "Employee"})
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* SECTION 2: AMOUNT WITH RUPEE LOGO */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">
            Reward Amount
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
              <span className="font-semibold text-gray-400 transition-colors group-focus-within:text-purple-600">
                ₹
              </span>
            </div>
            <input
              type="number"
              min="1"
              step="1"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              placeholder="Enter points"
              className="w-full py-3 pl-10 pr-4 font-medium text-gray-900 transition-all border border-gray-100 outline-none bg-gray-50 rounded-2xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
            />
          </div>
        </div>

        {/* SECTION 3: REASON/CATEGORY */}
        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700">
            Incentive Category
          </label>
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full px-4 py-3 font-medium text-gray-900 transition-all border border-gray-100 outline-none appearance-none cursor-pointer bg-gray-50 rounded-2xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500">
            <option value="spot">Spot Award</option>
            <option value="performance">Performance Bonus</option>
            <option value="referral">Referral Bonus</option>
            <option value="retention">Retention Incentive</option>
          </select>
        </div>
      </div>

      {/* SECTION 4: REMARKS */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-bold text-gray-700">
          Appreciation Note{" "}
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
            (Optional)
          </span>
        </label>
        <textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Write a small note for the employee..."
          className="w-full px-4 py-3 font-medium text-gray-900 transition-all border border-gray-100 outline-none resize-none bg-gray-50 rounded-2xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
        />
      </div>

      {/* NOTIFICATION TOGGLE */}
      <div className="flex items-center gap-3 p-4 border border-purple-100 bg-purple-50/50 rounded-2xl">
        <FiAlertCircle className="w-5 h-5 text-purple-600 shrink-0" />
        <p className="text-xs leading-tight text-purple-800">
          The employee will receive an automated email notification and a
          dashboard alert once this reward is approved.
        </p>
      </div>

      {/* ACTION BUTTONS */}
      <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-50">
        <button type="button" onClick={() => { setSelectedEmployee(null); setPoints(""); setNote(""); }} className="px-6 py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors">
          Discard
        </button>
        <button type="button" onClick={() => void assignReward()} disabled={submitting} className="px-8 py-3 bg-gray-900 text-white text-sm font-bold rounded-2xl shadow-lg shadow-gray-200 hover:bg-black hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
          {submitting ? "Assigning..." : "Assign Reward"}
        </button>
      </div>
    </div>
  );
};

export default IndividualForm;
