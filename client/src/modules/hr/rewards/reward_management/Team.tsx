import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import { hrApi } from "../../../../common/api/hrApi";
import { Initials } from "../../components/ui";
import { button, field, label } from "../../components/styles";

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
        allocation_type: "team",
        group_name: department,
        category: "Team Appreciation",
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
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="team-department" className={label}>Department</label>
          <select
            id="team-department"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            disabled={loading}
            className={`${field} cursor-pointer`}
          >
            <option value="">{loading ? "Loading…" : "Choose a department"}</option>
            {departments.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor="team-points" className={label}>Points for each person</label>
          <div className="relative">
            <input
              id="team-points"
              type="number"
              min="1"
              step="1"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              placeholder="200"
              className={`${field} pr-12 tabular-nums`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">pts</span>
          </div>
        </div>
      </div>

      {department && (
        <div className="rounded-lg border border-slate-200">
          <p className="border-b border-slate-200 px-4 py-2 text-xs text-slate-500">
            {members.length} {members.length === 1 ? "person" : "people"} in {department} will receive points
          </p>
          <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
            {members.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-slate-500">Nobody in this department is on the app yet</li>
            ) : members.map((member) => (
              <li key={member.id} className="flex items-center gap-3 px-4 py-2">
                <Initials name={member.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-900">{member.name}</p>
                  <p className="truncate text-xs text-slate-500">{member.role || member.email || "Employee"}</p>
                </div>
                {pointValue > 0 && <span className="text-sm tabular-nums text-slate-500">{pointValue.toLocaleString()} pts</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <label htmlFor="team-note" className={label}>
          Note to the team <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea id="team-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Great work on the launch, everyone." className={`${field} resize-none`} />
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          Total: <span className="font-medium tabular-nums text-slate-900">{totalCost.toLocaleString()} pts</span>
          {members.length > 0 && pointValue > 0 && (
            <span className="text-slate-400"> ({members.length} × {pointValue.toLocaleString()})</span>
          )}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setDepartment("");
              setPoints("");
              setNote("");
            }}
            className={button.ghost}
          >
            Clear
          </button>
          <button type="button" onClick={() => void distribute()} disabled={submitting || !members.length} className={button.primary}>
            {submitting ? "Sending…" : "Send to team"}
          </button>
        </div>
      </div>
    </div>
  );
}
