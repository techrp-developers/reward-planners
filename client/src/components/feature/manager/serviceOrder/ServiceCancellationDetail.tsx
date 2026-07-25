import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import axios from "axios";
import { api } from "../../../../api/api";

interface TimelineEntry { label: string; event: string; date: string }
interface CancellationDetailData {
  service_order_id: number;
  order_ref: string;
  status: string;
  service: { service_name: string; variant_name: string | null; title: string | null };
  address: null | { address1: string; address2: string | null; city: string; state: string; country: string; zipcode: string; landmark: string | null; contact_name: string; contact_phone: string };
  cancellation: null | { status: string; reason: string | null; comment: string | null; refund_status: string; refund_amount: number; created_at: string };
  timeline: TimelineEntry[];
  refund: { total: number; money_refund: number; coin_refund: number; status: string | null };
  rewards: { used: number; reversed: number };
  summary: { service_total: number; order_total: number };
}

interface DetailResponse { success: boolean; data: CancellationDetailData }

export default function ServiceCancellationDetail() {
  const { serviceOrderId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<CancellationDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!serviceOrderId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<DetailResponse>(`/order/service-cancellation-request/${serviceOrderId}`);
      setData(response.data.data);
    } catch (requestError) {
      console.error("Unable to fetch cancellation details", requestError);
      setError("Unable to load this service cancellation request.");
    } finally {
      setLoading(false);
    }
  }, [serviceOrderId]);

  useEffect(() => { fetchDetails(); }, [fetchDetails]);

  const decide = async (decision: "approve" | "reject") => {
    const approving = decision === "approve";
    const confirmation = await Swal.fire({
      title: approving ? "Approve service cancellation?" : "Reject service cancellation?",
      text: approving
        ? "The service will be cancelled and the wallet/card refund process will begin."
        : "The cancellation request will close and the service can continue.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: approving ? "#16a34a" : "#dc2626",
      confirmButtonText: approving ? "Approve cancellation" : "Reject cancellation",
    });
    if (!confirmation.isConfirmed) return;

    try {
      setActionLoading(true);
      await api.post(`/order/${decision}-service-cancellation/${serviceOrderId}`);
      await Swal.fire({
        icon: "success",
        title: approving ? "Cancellation approved" : "Cancellation rejected",
        timer: 1600,
        showConfirmButton: false,
      });
      await fetchDetails();
    } catch (requestError: unknown) {
      const responseData = axios.isAxiosError<{ message?: string }>(requestError)
        ? requestError.response?.data
        : undefined;
      const message = responseData?.message || "Unable to process the cancellation decision.";
      await Swal.fire({ icon: "error", title: "Action failed", text: message });
    } finally {
      setActionLoading(false);
    }
  };

  const currency = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value || 0));
  const date = (value: string) => new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const card = "mb-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm";
  const heading = "mb-4 text-xs font-bold uppercase tracking-widest text-gray-400";

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading cancellation request…</div>;
  if (error || !data) return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-600">{error || "Request not found"}</div>;

  return (
    <div className="min-h-screen p-6 md:p-10" style={{ background: "linear-gradient(160deg, #fdf8ff 0%, #fff5f8 50%, #f8f9ff 100%)" }}>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <button type="button" onClick={() => navigate(-1)} className="cursor-pointer rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-5 py-2.5 text-sm font-semibold text-white shadow-lg">← Back</button>
        <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">Service Cancellation Request</h1>
      </div>

      <section className={card}>
        <p className={heading}>Service summary</p>
        <div className="grid gap-6 md:grid-cols-4">
          <div><p className="text-xs text-gray-400">Order reference</p><p className="mt-1 font-semibold text-[#852BAF]">{data.order_ref}</p></div>
          <div><p className="text-xs text-gray-400">Service</p><p className="mt-1 font-semibold text-gray-800">{data.service.service_name}</p><p className="text-xs text-gray-500">{data.service.variant_name || data.service.title}</p></div>
          <div><p className="text-xs text-gray-400">Service status</p><p className="mt-1 font-semibold capitalize text-gray-800">{data.status.replaceAll("_", " ")}</p></div>
          <div><p className="text-xs text-gray-400">Service total</p><p className="mt-1 text-xl font-bold text-[#852BAF]">{currency(data.summary.service_total)}</p></div>
        </div>
      </section>

      <section className={card}>
        <p className={heading}>Cancellation decision</p>
        <div className="grid gap-6 md:grid-cols-3">
          <div><p className="text-xs text-gray-400">Status</p><p className="mt-1 font-semibold capitalize text-orange-600">{data.cancellation?.status || "Unknown"}</p></div>
          <div><p className="text-xs text-gray-400">Reason</p><p className="mt-1 font-semibold text-gray-800">{data.cancellation?.reason || "Not provided"}</p></div>
          <div><p className="text-xs text-gray-400">Requested</p><p className="mt-1 font-semibold text-gray-800">{data.cancellation?.created_at ? date(data.cancellation.created_at) : "—"}</p></div>
        </div>
        {data.cancellation?.comment && <p className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">{data.cancellation.comment}</p>}
      </section>

      {data.address && (
        <section className={card}>
          <p className={heading}>Customer and service address</p>
          <p className="font-semibold text-gray-800">{data.address.contact_name} · {data.address.contact_phone}</p>
          <p className="mt-2 text-sm text-gray-600">{data.address.address1}{data.address.address2 ? `, ${data.address.address2}` : ""}</p>
          <p className="text-sm text-gray-600">{data.address.city}, {data.address.state}, {data.address.country} – {data.address.zipcode}</p>
        </section>
      )}

      <section className={card}>
        <p className={heading}>Cancellation timeline</p>
        {data.timeline.length ? data.timeline.map((entry, index) => (
          <div key={`${entry.event}-${index}`} className="flex items-center justify-between border-b border-gray-50 py-3 last:border-0">
            <span className="text-sm font-medium text-gray-700">{entry.label}</span>
            <span className="text-sm text-gray-400">{date(entry.date)}</span>
          </div>
        )) : <p className="text-sm text-gray-400">No timeline events recorded.</p>}
      </section>

      <section className={card}>
        <p className={heading}>Refund breakdown</p>
        <div className="grid gap-5 md:grid-cols-4">
          <div><p className="text-xs text-gray-400">Total refund</p><p className="mt-1 font-bold text-gray-900">{currency(data.refund.total)}</p></div>
          <div><p className="text-xs text-gray-400">Original payment</p><p className="mt-1 font-semibold text-gray-800">{currency(data.refund.money_refund)}</p></div>
          <div><p className="text-xs text-gray-400">Wallet coins</p><p className="mt-1 font-semibold text-gray-800">{data.refund.coin_refund}</p></div>
          <div><p className="text-xs text-gray-400">Refund status</p><p className="mt-1 font-semibold capitalize text-gray-800">{data.refund.status || data.cancellation?.refund_status || "pending"}</p></div>
        </div>
      </section>

      {data.cancellation?.status === "requested" && (
        <div className="flex flex-wrap gap-4">
          <button type="button" disabled={actionLoading} onClick={() => decide("approve")} className="cursor-pointer rounded-xl bg-green-600 px-6 py-3 font-bold text-white shadow hover:bg-green-700 disabled:opacity-50">Approve cancellation</button>
          <button type="button" disabled={actionLoading} onClick={() => decide("reject")} className="cursor-pointer rounded-xl bg-red-600 px-6 py-3 font-bold text-white shadow hover:bg-red-700 disabled:opacity-50">Reject cancellation</button>
        </div>
      )}
    </div>
  );
}
