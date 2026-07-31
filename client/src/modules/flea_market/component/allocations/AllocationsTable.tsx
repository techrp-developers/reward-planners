import { Fragment, memo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FiAlertTriangle,
  FiClock,
  FiCornerUpLeft,
  FiEdit2,
  FiMoreVertical,
  FiPrinter,
  FiTrash2,
} from "react-icons/fi";
import {
  recordDamage,
  returnToVendor,
  updatePoolPrice,
  deletePool,
  fetchPoolLogs,
  type FleaMarketVendorStockPool,
} from "../../api/fleaMarketVendorStockApi";
import { getLabelPrintUrl } from "../../api/fleaMarketLabelsApi";
import { EmptyState } from "../ui/EmptyState";
import Spinner from "../ui/Spinner";

interface AllocationsTableProps {
  pools: FleaMarketVendorStockPool[];
  // Only used to tag a damage log with "this happened during that event" if
  // it's actually live right now — see poolStockService.resolveLogScheduleId.
  // The pool list itself is never scoped by it (pools persist across events).
  activeScheduleId?: number | null;
}

const STATUS_BADGE: Record<FleaMarketVendorStockPool["status"], string> = {
  active: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-200 text-slate-600",
};

function DamageForm({
  poolId,
  scheduleId,
  onDone,
}: {
  poolId: number;
  scheduleId?: number | null;
  onDone: () => void;
}) {
  const [quantity, setQuantity] = useState("");
  const [remarks, setRemarks] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => recordDamage(poolId, Number(quantity), remarks, scheduleId ?? undefined),
    onSuccess: () => {
      toast.success("Damage recorded");
      void queryClient.invalidateQueries({ queryKey: ["flea-market", "vendor-stock"] });
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

// Explicit end-of-program action — not triggered by any event closing
// anymore, since the pool persists across events.
function ReturnToVendorForm({
  poolId,
  availableQty,
  onDone,
}: {
  poolId: number;
  availableQty: number;
  onDone: () => void;
}) {
  const [returnQty, setReturnQty] = useState(String(availableQty));
  const [remarks, setRemarks] = useState("");
  const [closePool, setClosePool] = useState(true);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => returnToVendor(poolId, Number(returnQty), remarks, closePool),
    onSuccess: () => {
      toast.success("Stock returned to vendor");
      void queryClient.invalidateQueries({ queryKey: ["flea-market", "vendor-stock"] });
      onDone();
    },
    onError: (error) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        "Failed to return stock to vendor.";
      toast.error(message);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 p-3 rounded-lg bg-sky-50">
      <div>
        <label className="text-[10px] font-semibold text-sky-700">Qty to return · {availableQty} available</label>
        <input
          type="number"
          min={1}
          max={availableQty}
          value={returnQty}
          onChange={(e) => setReturnQty(e.target.value)}
          required
          className="block w-28 px-2 py-1 text-xs bg-white border border-sky-200 rounded-lg outline-none"
        />
      </div>
      <div className="flex-1 min-w-[160px]">
        <label className="text-[10px] font-semibold text-sky-700">Remarks (required)</label>
        <input
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          required
          placeholder="e.g. End of program, vendor picked up remaining stock"
          className="w-full px-2 py-1 text-xs bg-white border border-sky-200 rounded-lg outline-none"
        />
      </div>
      <label className="flex items-center gap-1.5 text-[10px] font-semibold text-sky-700 pb-1.5">
        <input type="checkbox" checked={closePool} onChange={(e) => setClosePool(e.target.checked)} className="accent-sky-600" />
        Close this pool
      </label>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="px-3 py-1.5 text-xs font-bold text-white rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-60"
      >
        {mutation.isPending ? "Saving..." : "Return"}
      </button>
      <button type="button" onClick={onDone} className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-700">
        Cancel
      </button>
    </form>
  );
}

// Price-only edit — doesn't touch quantities, so there's no available-qty
// guard here the way there is for damage/return.
function EditPriceForm({
  poolId,
  currentPrice,
  onDone,
}: {
  poolId: number;
  currentPrice: number | null;
  onDone: () => void;
}) {
  const [allocationPrice, setAllocationPrice] = useState(currentPrice != null ? String(currentPrice) : "");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => updatePoolPrice(poolId, allocationPrice.trim() === "" ? null : Number(allocationPrice)),
    onSuccess: () => {
      toast.success("Allocation price updated");
      void queryClient.invalidateQueries({ queryKey: ["flea-market", "vendor-stock"] });
      onDone();
    },
    onError: (error) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to update price.";
      toast.error(message);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2 p-3 rounded-lg bg-purple-50">
      <div>
        <label className="text-[10px] font-semibold text-purple-700">Allocation price</label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={allocationPrice}
          onChange={(e) => setAllocationPrice(e.target.value)}
          placeholder="e.g. 199.00"
          className="block w-32 px-2 py-1 text-xs bg-white border border-purple-200 rounded-lg outline-none"
        />
      </div>
      <button
        type="submit"
        disabled={mutation.isPending}
        className="px-3 py-1.5 text-xs font-bold text-white rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-60"
      >
        {mutation.isPending ? "Saving..." : "Save"}
      </button>
      <button type="button" onClick={onDone} className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:text-gray-700">
        Cancel
      </button>
    </form>
  );
}

// A single kebab-triggered dropdown replaces the row of always-visible text
// buttons — six simultaneous inline actions per row read as noisy/amateur at
// a glance; a menu keeps the row scannable and still surfaces every action.
interface RowActionsMenuProps {
  pool: FleaMarketVendorStockPool;
  logsOpen: boolean;
  onDamage: () => void;
  onReturn: () => void;
  onEdit: () => void;
  onLogs: () => void;
  onDelete: () => void;
  deleteDisabled: boolean;
  deleteTitle: string;
}

function RowActionsMenu({
  pool,
  logsOpen,
  onDamage,
  onReturn,
  onEdit,
  onLogs,
  onDelete,
  deleteDisabled,
  deleteTitle,
}: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);

  const MenuItem = ({
    icon,
    label,
    onClick,
    tone = "default",
    disabled = false,
    title,
  }: {
    icon: ReactNode;
    label: string;
    onClick: () => void;
    tone?: "default" | "danger";
    disabled?: boolean;
    title?: string;
  }) => (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={() => {
        setOpen(false);
        onClick();
      }}
      className={`flex items-center w-full gap-2.5 px-3 py-2 text-xs font-semibold text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent ${
        tone === "danger" ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50"
      }`}
    >
      <span className={tone === "danger" ? "text-red-500" : "text-gray-400"}>{icon}</span>
      {label}
    </button>
  );

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Row actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
          open ? "bg-gray-100 text-gray-700" : "text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        }`}
      >
        <FiMoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 overflow-hidden origin-top-right bg-white border border-gray-100 shadow-lg w-52 rounded-xl py-1.5"
          >
            {pool.status !== "closed" && (
              <MenuItem icon={<FiAlertTriangle className="w-3.5 h-3.5" />} label="Record Damage" onClick={onDamage} />
            )}
            {pool.status !== "closed" && pool.availableQty > 0 && (
              <MenuItem icon={<FiCornerUpLeft className="w-3.5 h-3.5" />} label="Return to Vendor" onClick={onReturn} />
            )}
            <MenuItem icon={<FiEdit2 className="w-3.5 h-3.5" />} label="Edit Price" onClick={onEdit} />
            <MenuItem
              icon={<FiClock className="w-3.5 h-3.5" />}
              label={logsOpen ? "Hide Logs" : "View Logs"}
              onClick={onLogs}
            />
            <div className="my-1 border-t border-gray-100" />
            <MenuItem
              icon={<FiPrinter className="w-3.5 h-3.5" />}
              label="Print · Thermal Label"
              onClick={() => window.open(getLabelPrintUrl(pool.poolId, "thermal"), "_blank", "noopener,noreferrer")}
            />
            <MenuItem
              icon={<FiPrinter className="w-3.5 h-3.5" />}
              label="Print · A4 Sheet"
              onClick={() => window.open(getLabelPrintUrl(pool.poolId, "a4sheet"), "_blank", "noopener,noreferrer")}
            />
            <div className="my-1 border-t border-gray-100" />
            <MenuItem
              icon={<FiTrash2 className="w-3.5 h-3.5" />}
              label="Delete Pool"
              tone="danger"
              onClick={onDelete}
              disabled={deleteDisabled}
              title={deleteTitle}
            />
          </div>
        </>
      )}
    </div>
  );
}

function LogsPanel({ poolId }: { poolId: number }) {
  const { data, isFetching } = useQuery({
    queryKey: ["flea-market", "pool-logs", poolId],
    queryFn: () => fetchPoolLogs(poolId),
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

function AllocationsTable({ pools, activeScheduleId }: AllocationsTableProps) {
  const [damageRowId, setDamageRowId] = useState<number | null>(null);
  const [returnRowId, setReturnRowId] = useState<number | null>(null);
  const [logsRowId, setLogsRowId] = useState<number | null>(null);
  const [editRowId, setEditRowId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (poolId: number) => deletePool(poolId),
    onSuccess: () => {
      toast.success("Pool deleted");
      void queryClient.invalidateQueries({ queryKey: ["flea-market", "vendor-stock"] });
    },
    onError: (error) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to delete pool.";
      toast.error(message);
    },
  });

  const handleDelete = (pool: FleaMarketVendorStockPool) => {
    if (!window.confirm(`Delete the pool for ${pool.vendorName} · ${pool.productName}? This can't be undone.`)) {
      return;
    }
    deleteMutation.mutate(pool.poolId);
  };

  if (pools.length === 0) {
    return (
      <EmptyState
        icon={FiAlertTriangle}
        title="No vendor stock pools yet"
        description="Use the form above to top up a vendor's stock."
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
            <th className="px-4 py-3 text-right">Price</th>
            <th className="px-4 py-3 text-center">Allocated</th>
            <th className="px-4 py-3 text-center">Sold</th>
            <th className="px-4 py-3 text-center">Damaged</th>
            <th className="px-4 py-3 text-center">Returned</th>
            <th className="px-4 py-3 text-center">Available</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {pools.map((pool) => (
            <Fragment key={pool.poolId}>
              <tr>
                <td className="px-4 py-3 font-medium text-gray-800">{pool.vendorName}</td>
                <td className="px-4 py-3 text-gray-700">{pool.productName}</td>
                <td className="px-4 py-3 text-gray-500">{pool.sku}</td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {pool.allocationPrice != null ? `₹${pool.allocationPrice.toLocaleString()}` : "—"}
                </td>
                <td className="px-4 py-3 text-center text-gray-700">{pool.allocatedQty}</td>
                <td className="px-4 py-3 text-center text-gray-700">{pool.soldQty}</td>
                <td className="px-4 py-3 text-center text-red-600">{pool.damagedQty}</td>
                <td className="px-4 py-3 text-center text-gray-500">{pool.returnedQty}</td>
                <td className="px-4 py-3 font-bold text-center text-gray-900">{pool.availableQty}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${STATUS_BADGE[pool.status]}`}>
                    {pool.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <RowActionsMenu
                    pool={pool}
                    logsOpen={logsRowId === pool.poolId}
                    onDamage={() => setDamageRowId(damageRowId === pool.poolId ? null : pool.poolId)}
                    onReturn={() => setReturnRowId(returnRowId === pool.poolId ? null : pool.poolId)}
                    onEdit={() => setEditRowId(editRowId === pool.poolId ? null : pool.poolId)}
                    onLogs={() => setLogsRowId(logsRowId === pool.poolId ? null : pool.poolId)}
                    onDelete={() => handleDelete(pool)}
                    deleteDisabled={pool.soldQty > 0 || pool.damagedQty > 0 || pool.returnedQty > 0 || deleteMutation.isPending}
                    deleteTitle={
                      pool.soldQty > 0 || pool.damagedQty > 0 || pool.returnedQty > 0
                        ? "Can't delete — this pool has sale, damage, or return history. Use Return to Vendor instead."
                        : "Delete this pool"
                    }
                  />
                </td>
              </tr>
              {damageRowId === pool.poolId && (
                <tr>
                  <td colSpan={11} className="px-4 pb-3">
                    <DamageForm poolId={pool.poolId} scheduleId={activeScheduleId} onDone={() => setDamageRowId(null)} />
                  </td>
                </tr>
              )}
              {returnRowId === pool.poolId && (
                <tr>
                  <td colSpan={11} className="px-4 pb-3">
                    <ReturnToVendorForm
                      poolId={pool.poolId}
                      availableQty={pool.availableQty}
                      onDone={() => setReturnRowId(null)}
                    />
                  </td>
                </tr>
              )}
              {editRowId === pool.poolId && (
                <tr>
                  <td colSpan={11} className="px-4 pb-3">
                    <EditPriceForm
                      poolId={pool.poolId}
                      currentPrice={pool.allocationPrice}
                      onDone={() => setEditRowId(null)}
                    />
                  </td>
                </tr>
              )}
              {logsRowId === pool.poolId && (
                <tr>
                  <td colSpan={11} className="px-4 pb-3">
                    <LogsPanel poolId={pool.poolId} />
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
