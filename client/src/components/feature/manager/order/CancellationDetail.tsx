import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../../../api/api";
import Swal from "sweetalert2";

interface Order {
  order_id: number;
  order_ref: string;
  status: string;
  cancellation_status: string;
  total_amount: string;
  reason: string;
  comment: string;
  requested_at: string;
}

interface Timeline {
  label: string;
  date: string;
}

interface Refund {
  amount: number;
  method: string;
  status: string;
}

interface Address {
  type: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  country: string;
  zipcode: string;
  landmark: string;
}

interface Customer {
  user_id: number;
  name: string;
  email: string;
  phone: string;
}

interface CancellationData {
  order: Order;
  customer: Customer;
  address: Address;
  timeline: Timeline[];
  refunds: Refund[];
  totalRefund: number;
}

interface CancellationResponse {
  success: boolean;
  data: CancellationData;
}

const CancellationDetail: React.FC = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState<CancellationData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDetails = async () => {
    setLoading(true);

    const res = await api.get<CancellationResponse>(
      `/order/cancellation-request/${orderId}`,
    );

    setData(res.data.data);
    setLoading(false);
  };

  useEffect(() => {
    if (orderId) fetchDetails();
  }, [orderId]);

  const formatCurrency = (amount: number | string) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(Number(amount));

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  const approveCancellation = async () => {
    const result = await Swal.fire({
      title: "Approve Cancellation?",
      text: "This will cancel the order and process the refund.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#16a34a",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Yes, Approve",
      cancelButtonText: "Cancel",
    });

    if (result.isConfirmed) {
      await api.post(`/order/approve-cancellation/${orderId}`);

      Swal.fire({
        icon: "success",
        title: "Cancellation Approved",
        text: "The order cancellation has been approved.",
        timer: 1800,
        showConfirmButton: false,
      });

      fetchDetails();
    }
  };

  const rejectCancellation = async () => {
    const result = await Swal.fire({
      title: "Reject Cancellation?",
      text: "The order will continue as normal.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc2626",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Yes, Reject",
      cancelButtonText: "Cancel",
    });

    if (result.isConfirmed) {
      await api.post(`/order/reject-cancellation/${orderId}`);

      Swal.fire({
        icon: "success",
        title: "Cancellation Rejected",
        text: "The cancellation request has been rejected.",
        timer: 1800,
        showConfirmButton: false,
      });

      fetchDetails();
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (!data) return null;

  const sectionCard = "bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-5";
  const sectionTitle = "text-xs font-bold text-gray-400 uppercase tracking-widest mb-4";
  const fieldLabel = "text-xs text-gray-400 font-medium";
  const fieldValue = "mt-1 font-semibold text-gray-800";

  return (
    <div className="min-h-screen p-6 md:p-10" style={{ background: "linear-gradient(160deg, #fdf8ff 0%, #fff5f8 50%, #f8f9ff 100%)" }}>

      {/* HEADER */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm font-semibold bg-gradient-to-r from-[#852BAF] to-[#FC3F78] text-white px-5 py-2.5 rounded-xl shadow-lg hover:scale-[1.03] active:scale-95 transition cursor-pointer"
        >
          ← Back
        </button>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">Cancellation Request</h2>
      </div>

      {/* ORDER SUMMARY */}
      <div className={sectionCard}>
        <p className={sectionTitle}>Order Summary</p>
        <div className="grid md:grid-cols-4 gap-6">
          <div>
            <span className={fieldLabel}>Order Ref</span>
            <p className={fieldValue}>{data.order.order_ref}</p>
          </div>
          <div>
            <span className={fieldLabel}>Order Status</span>
            <p className={`${fieldValue} capitalize`}>{data.order.status}</p>
          </div>
          <div>
            <span className={fieldLabel}>Cancellation Status</span>
            <p className="mt-1 font-semibold text-orange-600 capitalize">{data.order.cancellation_status}</p>
          </div>
          <div>
            <span className={fieldLabel}>Order Total</span>
            <p className="mt-1 text-xl font-bold text-[#852BAF]">{formatCurrency(data.order.total_amount)}</p>
          </div>
        </div>
      </div>

      {/* CANCELLATION REASON */}
      <div className={sectionCard}>
        <p className={sectionTitle}>Cancellation Reason</p>
        <p className="font-semibold text-gray-800">{data.order.reason}</p>
        {data.order.comment && (
          <p className="text-gray-500 text-sm mt-2">Comment: {data.order.comment}</p>
        )}
        <p className="text-xs text-gray-400 mt-3">Requested on {formatDate(data.order.requested_at)}</p>
      </div>

      {/* CUSTOMER */}
      <div className={sectionCard}>
        <p className={sectionTitle}>Customer Details</p>
        <div className="grid md:grid-cols-3 gap-6">
          <div><span className={fieldLabel}>Name</span><p className={fieldValue}>{data.customer.name}</p></div>
          <div><span className={fieldLabel}>Email</span><p className={fieldValue}>{data.customer.email}</p></div>
          <div><span className={fieldLabel}>Phone</span><p className={fieldValue}>{data.customer.phone}</p></div>
        </div>
      </div>

      {/* ADDRESS */}
      <div className={sectionCard}>
        <p className={sectionTitle}>Shipping Address</p>
        <p className="font-semibold text-gray-800">{data.address.line1}{data.address.line2 ? `, ${data.address.line2}` : ""}</p>
        <p className="text-gray-600 text-sm">{data.address.city}, {data.address.state}, {data.address.country}</p>
        <p className="text-gray-600 text-sm">{data.address.zipcode}</p>
        {data.address.landmark && (
          <p className="text-xs text-gray-400 mt-2">Landmark: {data.address.landmark}</p>
        )}
      </div>

      {/* TIMELINE */}
      <div className={sectionCard}>
        <p className={sectionTitle}>Cancellation Timeline</p>
        <div className="divide-y divide-gray-50">
          {data.timeline.map((event, i) => (
            <div key={i} className="flex justify-between py-3">
              <span className="capitalize font-medium text-gray-700 text-sm">{event.label}</span>
              <span className="text-gray-400 text-sm">{formatDate(event.date)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* REFUND */}
      <div className={sectionCard}>
        <p className={sectionTitle}>Refund Details</p>
        {data.refunds.length === 0 ? (
          <p className="text-gray-400 text-sm">No refunds yet</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {data.refunds.map((refund, i) => (
              <div key={i} className="flex justify-between items-center py-3 text-sm">
                <span className="font-medium text-gray-700">{refund.method}</span>
                <span className="font-semibold text-gray-800">{formatCurrency(refund.amount)}</span>
                <span className="capitalize text-gray-500">{refund.status}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100 font-bold">
          <span className="text-gray-800">Total Refund</span>
          <span className="text-[#852BAF] text-lg">{formatCurrency(data.totalRefund)}</span>
        </div>
      </div>

      {/* ACTION BUTTONS */}
      {data.order.cancellation_status === "requested" && (
        <div className="flex gap-4 mt-2">
          <button
            onClick={approveCancellation}
            className="px-6 py-2.5 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 shadow-sm transition-all cursor-pointer"
          >
            Approve Cancellation
          </button>
          <button
            onClick={rejectCancellation}
            className="px-6 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-all cursor-pointer"
          >
            Reject Cancellation
          </button>
        </div>
      )}
    </div>
  );
};

export default CancellationDetail;
