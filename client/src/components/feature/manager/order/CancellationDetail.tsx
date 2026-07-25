import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import axios from "axios";
import { api } from "../../../../api/api";

interface DetailData {
  request: {
    order_item_id: number; order_id: number; order_ref: string;
    product_name: string; brand_name: string; quantity: number;
    final_price: number; reward_coins_used: number;
    shipping_status: string; status: string;
    refund_status: string; refund_amount: number; reason_text: string | null;
    comment: string | null; requested_at: string;
  };
  timeline: { event: string; created_at: string }[];
  refunds: { refund_amount: number; refund_method: string; status: string }[];
}

export default function CancellationDetail() {
  const { orderId: orderItemId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const load = useCallback(async () => {
    if (!orderItemId) return;
    try {
      setLoading(true);
      const response = await api.get<{ data: DetailData }>(
        `/order/item-cancellation-request/${orderItemId}`,
      );
      setData(response.data.data);
    } finally {
      setLoading(false);
    }
  }, [orderItemId]);

  useEffect(() => { load(); }, [load]);

  const decide = async (decision: "approve" | "reject") => {
    const approving = decision === "approve";
    const confirmation = await Swal.fire({
      title: `${approving ? "Approve" : "Reject"} item cancellation?`,
      text: approving
        ? "Only this product will be cancelled and its eligible card/wallet amount refunded."
        : "This product will remain active in the order.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: approving ? "#16a34a" : "#dc2626",
      confirmButtonText: approving ? "Approve cancellation" : "Reject cancellation",
    });
    if (!confirmation.isConfirmed) return;
    try {
      setActionLoading(true);
      await api.post(`/order/${decision}-item-cancellation/${orderItemId}`);
      await Swal.fire({ icon: "success", title: `Cancellation ${approving ? "approved" : "rejected"}`, timer: 1500, showConfirmButton: false });
      await load();
    } catch (error: unknown) {
      const message = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined;
      await Swal.fire({ icon: "error", title: "Action failed", text: message || "Unable to process this request." });
    } finally {
      setActionLoading(false);
    }
  };

  const currency = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value || 0));
  const card = "mb-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm";

  if (loading) return <div className="p-8 text-gray-500">Loading request…</div>;
  if (!data) return <div className="p-8 text-red-600">Request not found.</div>;
  const request = data.request;
  const money = data.refunds.filter((r) => r.refund_method === "original").reduce((sum, r) => sum + Number(r.refund_amount), 0);
  const wallet = data.refunds.filter((r) => r.refund_method === "wallet").reduce((sum, r) => sum + Number(r.refund_amount), 0);
  const eligibleMoney = Number(request.final_price || 0);
  const eligibleWallet = Number(request.reward_coins_used || 0);
  const eligibleTotal = eligibleMoney + eligibleWallet;

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="mb-8 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="cursor-pointer rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-5 py-2.5 font-semibold text-white">← Back</button>
        <h1 className="text-3xl font-bold">Item Cancellation</h1>
      </div>
      <section className={card}>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">Item summary</h2>
        <div className="grid gap-5 md:grid-cols-4">
          <div><p className="text-xs text-gray-400">Order</p><p className="font-semibold text-[#852BAF]">{request.order_ref}</p></div>
          <div><p className="text-xs text-gray-400">Product</p><p className="font-semibold">{request.product_name}</p><p className="text-xs text-gray-500">{request.brand_name} · Qty {request.quantity}</p></div>
          <div><p className="text-xs text-gray-400">Shipment</p><p className="font-semibold capitalize">{request.shipping_status.replaceAll("_", " ")}</p></div>
          <div>
            <p className="text-xs text-gray-400">Paid value</p>
            <p className="font-bold">{currency(eligibleTotal)}</p>
            <p className="text-xs text-gray-500">
              {currency(eligibleMoney)} payment + {eligibleWallet} wallet coin{eligibleWallet === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </section>
      <section className={card}>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">Cancellation request</h2>
        <p><strong>Status:</strong> <span className="capitalize">{request.status}</span></p>
        <p><strong>Reason:</strong> {request.reason_text || "Not provided"}</p>
        {request.comment && <p className="mt-3 rounded-xl bg-gray-50 p-4">{request.comment}</p>}
      </section>
      <section className={card}>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">Timeline</h2>
        {data.timeline.map((entry) => (
          <div key={`${entry.event}-${entry.created_at}`} className="flex justify-between border-b py-3 last:border-0">
            <span className="capitalize">{entry.event.replaceAll("_", " ")}</span>
            <span className="text-gray-400">{new Date(entry.created_at).toLocaleString("en-IN")}</span>
          </div>
        ))}
      </section>
      <section className={card}>
        <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-gray-400">Refund breakdown</h2>
        <div className="grid gap-5 md:grid-cols-4">
          <div><p className="text-xs text-gray-400">Total refund</p><p className="font-bold">{currency(request.status === "requested" ? eligibleTotal : request.refund_amount)}</p></div>
          <div><p className="text-xs text-gray-400">Original payment</p><p className="font-semibold">{currency(request.status === "requested" ? eligibleMoney : money)}</p></div>
          <div><p className="text-xs text-gray-400">Wallet coins</p><p className="font-semibold">{request.status === "requested" ? eligibleWallet : wallet}</p></div>
          <div><p className="text-xs text-gray-400">Status</p><p className="font-semibold capitalize">{request.refund_status}</p></div>
        </div>
      </section>
      {request.status === "requested" && (
        <div className="flex gap-4">
          <button disabled={actionLoading} onClick={() => decide("approve")} className="cursor-pointer rounded-xl bg-green-600 px-6 py-3 font-bold text-white disabled:opacity-50">Approve cancellation</button>
          <button disabled={actionLoading} onClick={() => decide("reject")} className="cursor-pointer rounded-xl bg-red-600 px-6 py-3 font-bold text-white disabled:opacity-50">Reject cancellation</button>
        </div>
      )}
    </div>
  );
}
