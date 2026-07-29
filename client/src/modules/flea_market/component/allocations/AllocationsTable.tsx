import { Fragment, memo, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FiAlertTriangle, FiChevronDown, FiChevronUp, FiClock } from "react-icons/fi";
import {
  recordDamage,
  fetchAllocationLogs,
  type FleaMarketAllocation,
} from "../../api/fleaMarketAllocationsApi";
import { getLabelPrintUrl } from "../../api/fleaMarketLabelsApi";
import { EmptyState } from "../ui/EmptyState";
import Spinner from "../ui/Spinner";
import PrintLabelButton from "./PrintLabelButton";

interface AllocationsTableProps {
  allocations: FleaMarketAllocation[];
  scheduleId: number;
}

const STATUS_BADGE: Record<FleaMarketAllocation["status"], string> = {
  allocated: "bg-gray-100 text-gray-600",
  active: "bg-emerald-100 text-emerald-700",
  completed: "bg-blue-100 text-blue-700",
  closed: "bg-slate-200 text-slate-600",
};

function DamageForm({ allocationId, onDone }: { allocationId: number; onDone: () => void }) {
  const [quantity, setQuantity] = useState("");
  const [remarks, setRemarks] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => recordDamage(allocationId, Number(quantity), remarks),
    onSuccess: () => {
      toast.success("Damage recorded");
      void queryClient.invalidateQueries({ queryKey: ["flea-market", "allocations"] });
      onDone();
    },
    onError: (error) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to record damage.";
      toast.error(message);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 p-3 rounded-lg bg-amber-50">
      <div>
        <label className="text-[10px] font-semibold text-amber-700">Qty damaged</label>
        <input
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          required
          className="block w-24 px-2 py-1 text-xs bg-white border border-amber-200 rounded-lg outline-none"
        />
      </div>
      <div className="flex-1 min-w-[160px]">
        <label className="text-[10px] font-semibold text-amber-700">Remarks (required)</label>
        <input
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          required
          placeholder="e.g. Box crushed in transit"
          className="w-full px-2 py-1 text-xs bg-white border border-amber-200 rounded-lg outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="px-3 py-1.5 text-xs font-bold text-white rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60"
      >
        {mutation.isPending ? "Saving..." : "Save"}
      </button>
      <button type="button" onClick={onDone} className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-700">
        Cancel
      </button>
    </form>
  );
}

function LogsPanel({ allocationId }: { allocationId: number }) {
  const { data, isFetching } = useQuery({
    queryKey: ["flea-market", "allocation-logs", allocationId],
    queryFn: () => fetchAllocationLogs(allocationId),
  });

  if (isFetching) {
    return (
      <div className="py-3">
        <Spinner label="Loading logs..." />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return <p className="py-3 text-xs text-center text-gray-400">No log entries yet.</p>;
  }

  return (
    <ul className="py-2 space-y-1.5">
      {data.map((log) => (
        <li key={log.logId} className="flex items-center justify-between px-3 py-1.5 text-xs bg-gray-50 rounded-lg">
          <span className="font-semibold text-gray-700 capitalize">{log.action}</span>
          <span className="text-gray-500">{log.quantity > 0 ? `+${log.quantity}` : log.quantity}</span>
          {log.remarks && <span className="italic text-gray-400 truncate max-w-[200px]">{log.remarks}</span>}
          <span className="text-gray-400">{new Date(log.createdAt).toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

function AllocationsTable({ allocations }: AllocationsTableProps) {
  const [damageRowId, setDamageRowId] = useState<number | null>(null);
  const [logsRowId, setLogsRowId] = useState<number | null>(null);

  if (allocations.length === 0) {
    return (
      <EmptyState
        icon={FiAlertTriangle}
        title="No stock allocated to this event yet"
        description="Use the form above to allocate vendor stock."
      />
    );
  }

  return (
    <div className="overflow-x-auto border border-gray-100 rounded-xl">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr className="text-[11px] font-bold tracking-wider text-left text-gray-500 uppercase">
            <th className="px-4 py-3">Vendor</th>
            <th className="px-4 py-3">Product</th>
            <th className="px-4 py-3">SKU</th>
            <th className="px-4 py-3 text-center">Allocated</th>
            <th className="px-4 py-3 text-center">Sold</th>
            <th className="px-4 py-3 text-center">Damaged</th>
            <th className="px-4 py-3 text-center">Available</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {allocations.map((allocation) => (
            <Fragment key={allocation.allocationId}>
              <tr>
                <td className="px-4 py-3 font-medium text-gray-800">{allocation.vendorName}</td>
                <td className="px-4 py-3 text-gray-700">{allocation.productName}</td>
                <td className="px-4 py-3 text-gray-500">{allocation.sku}</td>
                <td className="px-4 py-3 text-center text-gray-700">{allocation.allocatedQty}</td>
                <td className="px-4 py-3 text-center text-gray-700">{allocation.soldQty}</td>
                <td className="px-4 py-3 text-center text-red-600">{allocation.damagedQty}</td>
                <td className="px-4 py-3 font-bold text-center text-gray-900">{allocation.availableQty}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${STATUS_BADGE[allocation.status]}`}>
                    {allocation.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {allocation.status !== "closed" && (
                      <button
                        type="button"
                        onClick={() => setDamageRowId(damageRowId === allocation.allocationId ? null : allocation.allocationId)}
                        className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-800"
                      >
                        <FiAlertTriangle className="w-3.5 h-3.5" />
                        Damage
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setLogsRowId(logsRowId === allocation.allocationId ? null : allocation.allocationId)}
                      className="flex items-center gap-1 text-xs font-bold text-gray-500 hover:text-gray-700"
                    >
                      <FiClock className="w-3.5 h-3.5" />
                      Logs
                      {logsRowId === allocation.allocationId ? (
                        <FiChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <FiChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <PrintLabelButton label="Print" getUrl={(format) => getLabelPrintUrl(allocation.allocationId, format)} />
                  </div>
                </td>
              </tr>
              {damageRowId === allocation.allocationId && (
                <tr>
                  <td colSpan={9} className="px-4 pb-3">
                    <DamageForm allocationId={allocation.allocationId} onDone={() => setDamageRowId(null)} />
                  </td>
                </tr>
              )}
              {logsRowId === allocation.allocationId && (
                <tr>
                  <td colSpan={9} className="px-4 pb-3">
                    <LogsPanel allocationId={allocation.allocationId} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default memo(AllocationsTable);
