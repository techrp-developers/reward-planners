import { useEffect, useState } from "react";
import { FiInfo, FiUsers } from "react-icons/fi";
import Swal from "sweetalert2";
import { hrApi } from "../../../../common/api/hrApi";

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
    <div className="space-y-7 duration-500 animate-in fade-in slide-in-from-bottom-2">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm font-bold text-gray-700">Points per Employee</span>
          <input
            type="number"
            min="1"
            step="1"
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            placeholder="Enter points"
            className="w-full px-4 py-3 font-medium text-gray-900 transition-all border border-gray-100 outline-none bg-gray-50 rounded-2xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
          />
        </label>
        <div className="p-4 border border-purple-100 bg-purple-50/50 rounded-2xl">
          <p className="text-xs font-bold tracking-wide text-purple-500 uppercase">Active Recipients</p>
          <p className="mt-1 text-2xl font-black text-purple-800">{loading ? "..." : employees.length}</p>
        </div>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-bold text-gray-700">Appreciation Note (Optional)</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          className="w-full px-4 py-3 font-medium text-gray-900 transition-all border border-gray-100 outline-none resize-none bg-gray-50 rounded-2xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
        />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 p-5 border border-purple-100 bg-purple-50/50 rounded-2xl">
          <FiUsers className="w-6 h-6 text-purple-600" />
          <div><p className="text-xs text-gray-500">Employees</p><p className="font-bold text-gray-900">{employees.length}</p></div>
        </div>
        <div className="p-5 border border-amber-100 bg-amber-50/50 rounded-2xl">
          <p className="text-xs text-gray-500">Total Wallet Deduction</p>
          <p className="font-bold text-amber-700">{totalCost.toLocaleString()} points</p>
        </div>
      </div>

      <div className="flex items-center gap-3 p-4 text-xs leading-tight text-amber-800 border border-amber-100 bg-amber-50/50 rounded-2xl">
        <FiInfo className="w-5 h-5 shrink-0" />
        Only active employees are included. Every recipient must have an active customer account.
      </div>

      <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-50">
        <button
          type="button"
          onClick={() => {
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
          disabled={submitting || loading || !employees.length}
          className="px-10 py-3 bg-gray-900 text-white text-sm font-bold rounded-2xl shadow-lg shadow-gray-200 hover:bg-black hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
          {submitting ? "Distributing..." : "Confirm Allocation"}
        </button>
      </div>
    </div>
  );
}
