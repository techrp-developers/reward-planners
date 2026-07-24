import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiXCircle } from "react-icons/fi";
import { api } from "../../../../api/api";

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

export default function CancellationRequests() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<ItemCancellation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const response = await api.get<{
          success: boolean;
          requests: ItemCancellation[];
        }>("/order/item-cancellation-requests");
        setRequests(response.data.requests || []);
      } catch (requestError) {
        console.error("Unable to fetch item cancellations", requestError);
        setError("Unable to load item cancellation requests.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const currency = (value: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(Number(value || 0));

  return (
    <div className="min-h-screen w-full">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-[#852BAF] to-[#FC3F78] shadow-md">
            <FiXCircle className="text-xl text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Item Cancellation Requests</h1>
            <p className="mt-1 text-sm text-gray-500">
              Review individual products without cancelling the remaining order.
            </p>
          </div>
        </div>

        {error && <div className="mb-4 rounded-xl bg-red-50 p-4 text-red-600">{error}</div>}
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gradient-to-r from-purple-50 to-pink-50">
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
                <tr><td colSpan={7} className="py-16 text-center text-gray-400">No item cancellation requests.</td></tr>
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
                      Review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
