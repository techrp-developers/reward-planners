import React, { useEffect, useMemo, useState } from "react";
import { FiSearch } from "react-icons/fi";
import { hrApi } from "../../../../common/api/hrApi";
import { Initials } from "../../components/ui";
import { button, field, label } from "../../components/styles";
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
        allocation_type: "individual",
        category: rewardTitles[category],
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
    <div className="space-y-5">
      <div>
        <p className={label}>Employee</p>
        {selectedEmployee ? (
          <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Initials name={selectedEmployee.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{selectedEmployee.name}</p>
              <p className="truncate text-xs text-slate-500">
                {[selectedEmployee.role, selectedEmployee.department].filter(Boolean).join(" · ") || selectedEmployee.email || "Employee"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedEmployee(null);
                setSearch("");
              }}
              className={button.ghost}
            >
              Change
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-300 focus-within:border-[#852BAF] focus-within:ring-2 focus-within:ring-[#852BAF]/15">
            <div className="relative border-b border-slate-200">
              <FiSearch className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, email or department"
                aria-label="Search employees"
                className="w-full bg-white py-2 pl-8 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>
            <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
              {loadingEmployees ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">Loading employees…</p>
              ) : filteredEmployees.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-500">
                  {search ? "Nobody matches that search" : "No one is on the app yet. Only employees who have activated it can receive points."}
                </p>
              ) : (
                filteredEmployees.map((employee) => (
                  <button
                    type="button"
                    key={employee.id}
                    onClick={() => {
                      setSelectedEmployee(employee);
                      setSearch("");
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-50 cursor-pointer"
                  >
                    <Initials name={employee.name} size="sm" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-slate-900">{employee.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {employee.email || "No email"}{employee.department ? ` · ${employee.department}` : ""}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="reward-points" className={label}>Points</label>
          <div className="relative">
            <input
              id="reward-points"
              type="number"
              min="1"
              step="1"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              placeholder="500"
              className={`${field} pr-12 tabular-nums`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">pts</span>
          </div>
        </div>

        <div>
          <label htmlFor="reward-category" className={label}>Reason</label>
          <select id="reward-category" value={category} onChange={(event) => setCategory(event.target.value)} className={`${field} cursor-pointer`}>
            <option value="spot">Spot award</option>
            <option value="performance">Performance bonus</option>
            <option value="referral">Referral bonus</option>
            <option value="retention">Retention incentive</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="reward-note" className={label}>
          Note to {selectedEmployee?.name.split(" ")[0] || "the employee"} <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id="reward-note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Thanks for staying late to close the quarter."
          className={`${field} resize-none`}
        />
        <p className="mt-1.5 text-xs text-slate-500">They'll get this with an email and an in-app notification.</p>
      </div>

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
        <button type="button" onClick={() => { setSelectedEmployee(null); setPoints(""); setNote(""); }} className={button.ghost}>
          Clear
        </button>
        <button type="button" onClick={() => void assignReward()} disabled={submitting} className={button.primary}>
          {submitting ? "Sending…" : points && selectedEmployee ? `Send ${Number(points).toLocaleString()} pts` : "Send reward"}
        </button>
      </div>
    </div>
  );
};

export default IndividualForm;
