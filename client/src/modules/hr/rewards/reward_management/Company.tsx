import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import { hrApi } from "../../../../common/api/hrApi";
import { button, field, label } from "../../components/styles";

interface Employee {
  id: number;
  name: string;
  department: string | null;
}

export default function CompanyForm({
  onAwardComplete,
}: {
  onAwardComplete?: (balance: number) => void;
}) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [points, setPoints] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    hrApi
      .get("/employees", { params: { status: "active", limit: 500 } })
      .then((response) => setEmployees(response.data?.data || []))
      .catch((error) => console.error("Unable to load company employees:", error))
      .finally(() => setLoading(false));
  }, []);

  const pointValue = Number(points) || 0;
  const totalCost = pointValue * employees.length;

  const distribute = async () => {
    if (!employees.length) {
      await Swal.fire("No recipients", "No active employees were found.", "warning");
      return;
    }
    if (!Number.isSafeInteger(pointValue) || pointValue <= 0) {
      await Swal.fire("Invalid points", "Enter positive whole-number points per employee.", "warning");
      return;
    }

    const confirmation = await Swal.fire({
      title: "Confirm company reward",
      text: `${totalCost.toLocaleString()} total points will be distributed to ${employees.length} employees.`,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Distribute",
    });
    if (!confirmation.isConfirmed) return;

    try {
      setSubmitting(true);
      const response = await hrApi.post("/company-wallet/award", {
        employee_ids: employees.map((employee) => employee.id),
        points: pointValue,
        allocation_type: "department",
        group_name: "Entire Company",
        category: "Organization Appreciation",
        title: "Company-wide Reward",
        description: note,
      });
      onAwardComplete?.(Number(response.data?.data?.balance || 0));
      await Swal.fire("Rewards distributed", `Points were credited to ${employees.length} employees.`, "success");
      setPoints("");
      setNote("");
    } catch (error: any) {
      const code = error.response?.data?.code;
      await Swal.fire(
        code === "CUSTOMER_NOT_ONBOARDED" ? "Customer onboarding required" : "Unable to distribute rewards",
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
          <label htmlFor="company-points" className={label}>Points for each person</label>
          <div className="relative">
            <input
              id="company-points"
              type="number"
              min="1"
              step="1"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              placeholder="100"
              className={`${field} pr-12 tabular-nums`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">pts</span>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5">
          <p className="text-xs text-slate-500">Recipients</p>
          <p className="text-lg font-semibold tabular-nums text-slate-900">{loading ? "—" : employees.length}</p>
          <p className="text-xs text-slate-400">Everyone who has activated the app</p>
        </div>
      </div>

      <div>
        <label htmlFor="company-note" className={label}>
          Note to everyone <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id="company-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="Thank you for a great year."
          className={`${field} resize-none`}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          Total: <span className="font-medium tabular-nums text-slate-900">{totalCost.toLocaleString()} pts</span>
          {employees.length > 0 && pointValue > 0 && (
            <span className="text-slate-400"> ({employees.length} × {pointValue.toLocaleString()})</span>
          )}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setPoints("");
              setNote("");
            }}
            className={button.ghost}
          >
            Clear
          </button>
          <button type="button" onClick={() => void distribute()} disabled={submitting || loading || !employees.length} className={button.primary}>
            {submitting ? "Sending…" : "Send to everyone"}
          </button>
        </div>
      </div>
    </div>
  );
}
