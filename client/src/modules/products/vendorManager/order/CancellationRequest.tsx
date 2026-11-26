import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../common/api/api";

interface ItemCancellation {
  order_item_id: number;
  order_ref: string;
  customer_name: string;
  product_name: string;
  quantity: number;
  final_price: number;
  reward_coins_used: number;
  refundable_total: number;
  status: string;
  refund_status: string;
  requested_at: string;
}

const statusTabs = [
  { value: "requested", label: "Pending" },
  { value: "approved", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];
const limit = 20;

export default function CancellationRequests() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<ItemCancellation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("requested");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const statusLabel = statusTabs.find((tab) => tab.value === status)?.label;

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await api.get<{
          success: boolean;
          requests: ItemCancellation[];
          total: number;
        }>("/order/item-cancellation-requests", { params: { status, page, limit } });
        if (!response.data.success) throw new Error("Unable to fetch requests");
        if (!active) return;
        setRequests(response.data.requests || []);
        setTotal(response.data.total);
      } catch (requestError) {
        if (!active) return;
        console.error("Unable to fetch item cancellations", requestError);
        setRequests([]);
        setTotal(0);
        setError("Unable to load item cancellation requests.");
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [status, page]);

  const currency = (value: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(Number(value || 0));

  return (
    <div className="w-full pb-8">
      <div>
        <div className="mb-8 flex items-start gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Item Cancellation Requests</h1>
            <p className="mt-1 text-sm text-gray-500">
              Review individual products without cancelling the remaining order.
            </p>
          </div>
        </div>

        <div className="mb-6 flex gap-2 overflow-x-auto border-b border-gray-200" aria-label="Filter cancellation requests by status">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={status === tab.value}
              onClick={() => {
                setStatus(tab.value);
                setPage(1);
              }}
              className={`shrink-0 cursor-pointer border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                status === tab.value
                  ? "border-[#852BAF] text-[#852BAF]"
                  : "border-transparent text-gray-500 hover:border-purple-200 hover:text-[#852BAF]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && <div className="mb-4 rounded-xl bg-red-50 p-4 text-red-600">{error}</div>}
        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
          <table className="min-w-full divide-y divide-gray-100">
            <thead>
              <tr>
                {["Order", "Product", "Customer", "Amount", "Status", "Requested", "Action"].map((heading) => (
                  <th key={heading} className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-500">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={7} className="py-16 text-center text-gray-400">Loading requests…</td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-center text-gray-400">{error ? "Requests could not be loaded." : `No ${statusLabel?.toLowerCase()} cancellation requests.`}</td></tr>
              ) : requests.map((request) => (
                <tr key={request.order_item_id} className="hover:bg-purple-50/30">
                  <td className="px-5 py-4 font-semibold text-[#852BAF]">{request.order_ref}</td>
                  <td className="px-5 py-4">
                    <p className="font-semibold text-gray-800">{request.product_name}</p>
                    <p className="text-xs text-gray-400">Qty {request.quantity} · Item #{request.order_item_id}</p>
                  </td>
                  <td className="px-5 py-4 text-gray-700">{request.customer_name}</td>
                  <td className="px-5 py-4">
                    <p className="font-semibold">{currency(request.refundable_total)}</p>
                    <p className="text-xs text-gray-500">
                      {currency(request.final_price)} payment
                      {Number(request.reward_coins_used || 0) > 0
                        ? ` + ${request.reward_coins_used} wallet coin${Number(request.reward_coins_used) === 1 ? "" : "s"}`
                        : ""}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-sm capitalize">{request.status} · refund {request.refund_status}</td>
                  <td className="px-5 py-4 text-sm text-gray-500">{new Date(request.requested_at).toLocaleString("en-IN")}</td>
                  <td className="px-5 py-4">
                    <button onClick={() => navigate(`/manager/cancellation-detail/${request.order_item_id}`)} className="cursor-pointer rounded-lg border border-purple-200 bg-purple-50 px-4 py-1.5 font-semibold text-[#852BAF] hover:bg-[#852BAF] hover:text-white">
                      {request.status === "requested" ? "Review" : "View"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!error && (
          <div className="mt-6 flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3">
            <button
              type="button"
              disabled={loading || page === 1}
              onClick={() => setPage((current) => current - 1)}
              className="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              Prev
            </button>
            <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
            <button
              type="button"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
