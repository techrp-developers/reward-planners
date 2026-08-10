import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../common/api/api";
import { FiCheck, FiFileText, FiX } from "react-icons/fi";

interface Customer {
  name: string;
  email: string;
  mobile: string;
}

interface Address {
  address_type: string;
  address1: string;
  address2: string;
  city: string;
  zipcode: string;
  landmark: string;
  contact_name: string;
  contact_phone: string;
  state: string;
  country: string;
}

interface ServiceItem {
  id: number;
  order_ref: string;
  service_name: string;
  variant_name: string;
  title: string;
  image_url: string | null;
  price: number;
  status: string;
  timeline: Array<{ status: string; completed: boolean }>;
}

interface Bundle {
  bundle_id: number;
  bundle_total: number;
  items: ServiceItem[];
}

interface OrderDocument {
  id: number;
  document_key: string;
  document_name: string;
  is_mandatory: boolean;
  is_expirable: boolean;
  uploaded: boolean;
  uploaded_at: string | null;
  expiry_date: string | null;
  document_number: string | null;
  file_url: string | null;
}

interface ServiceOrderDetails {
  parent_order_id: string;
  status: string;
  created_at: string;
  customer: Customer;
  address: Address | null;
  items: ServiceItem[];
  bundles: Bundle[];
  documents: OrderDocument[];
  total_amount: number;
}

interface ApiResponse {
  success: boolean;
  data: ServiceOrderDetails;
}

const ServiceItemTimeline = ({ timeline = [] }: { timeline?: ServiceItem["timeline"] }) => (
  <div className="min-w-[280px] py-1">
    <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(timeline.length, 1)}, minmax(0, 1fr))` }}>
      {timeline.map((step, index) => {
        const cancelled = step.status.toLowerCase().includes("cancelled");
        return <div key={step.status} className="relative flex flex-col items-center text-center">
          <span className={`absolute left-0 right-0 top-3 h-0.5 ${index === 0 ? "left-1/2" : ""} ${index === timeline.length - 1 ? "right-1/2" : ""} ${cancelled ? "bg-red-300" : step.completed ? "bg-gradient-to-r from-[#852BAF] to-[#FC3F78]" : "bg-slate-200"}`} />
          <span className={`relative z-10 grid h-6 w-6 place-items-center rounded-full border-2 border-white text-[10px] shadow-sm ${cancelled ? "bg-red-500 text-white" : step.completed ? "bg-gradient-to-br from-[#852BAF] to-[#FC3F78] text-white" : "bg-slate-200 text-slate-400"}`}>{cancelled ? <FiX /> : step.completed ? <FiCheck /> : index + 1}</span>
          <span className={`mt-2 max-w-20 whitespace-normal text-[9px] font-bold leading-3 ${cancelled ? "text-red-600" : step.completed ? "text-slate-700" : "text-slate-400"}`}>{step.status}</span>
        </div>;
      })}
    </div>
  </div>
);

const updatedTimeline = (current: ServiceItem["timeline"], status: string) => {
  const confirmed = current?.find((step) => step.status === "Order Confirmed")?.completed ?? true;
  if (status === "cancelled") return [{ status: "Order Confirmed", completed: confirmed }, { status: "Order Cancelled", completed: true }];
  return [
    { status: "Order Confirmed", completed: confirmed },
    { status: "Documents Submitted", completed: ["documents_uploaded", "in_progress", "completed"].includes(status) },
    { status: "In Progress", completed: ["in_progress", "completed"].includes(status) },
    { status: "Completed", completed: status === "completed" },
  ];
};

const getParentStatus = (items: ServiceItem[], bundles: Bundle[]) => {
  const statuses = [...items, ...bundles.flatMap((bundle) => bundle.items)].map((item) => item.status);
  if (statuses.length > 0 && statuses.every((status) => status === "cancelled")) return "cancelled";
  if (statuses.some((status) => status === "completed") && statuses.every((status) => ["completed", "cancelled"].includes(status))) return "completed";
  if (statuses.some((status) => status === "in_progress")) return "in_progress";
  if (statuses.some((status) => status === "documents_uploaded")) return "documents_uploaded";
  if (statuses.some((status) => status === "documents_pending")) return "documents_pending";
  return "pending_payment";
};

const ServiceOrderView: React.FC = () => {
  const { parentOrderId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState<ServiceOrderDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [updatingStatus, setUpdatingStatus] = useState(false);

  const STATUS_OPTIONS = [
    "in_progress",
    "completed",
  ];

  const fetchOrder = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.get<ApiResponse>(
        `/v1/service-orders/admin-order-details/${parentOrderId}`,
      );

      if (!res.data.success) {
        throw new Error("Failed to fetch order");
      }

      setData(res.data.data);
    } catch (err) {
      console.error(err);
      setError("Unable to load service order.");
    } finally {
      setLoading(false);
    }
  }, [parentOrderId]);

  useEffect(() => {
    if (parentOrderId) {
      fetchOrder();
    }
  }, [fetchOrder, parentOrderId]);

  const updateServiceStatus = async (serviceId: number, status: string) => {
    try {
      setUpdatingStatus(true);

      await api.put(`/v1/service-orders/status/${serviceId}`, {
        status,
      });

      setData((prev) => {
        if (!prev) return prev;

        const updatedItems = prev.items.map((item) =>
          item.id === serviceId ? { ...item, status, timeline: updatedTimeline(item.timeline, status) } : item,
        );

        return {
          ...prev,
          items: updatedItems,
          status: getParentStatus(updatedItems, prev.bundles),
        };
      });
    } catch (err) {
      console.error(err);
      alert("Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const cancelService = async (serviceId: number) => {
    const confirmCancel = window.confirm(
      "Are you sure you want to cancel this service?",
    );

    if (!confirmCancel) return;

    try {
      setUpdatingStatus(true);

      await api.put(`/v1/service-orders/status/${serviceId}`, {
        status: "cancelled",
      });

      setData((prev) => {
        if (!prev) return prev;

        const updatedItems = prev.items.map((item) =>
          item.id === serviceId ? { ...item, status: "cancelled", timeline: updatedTimeline(item.timeline, "cancelled") } : item,
        );

        return {
          ...prev,
          items: updatedItems,
          status: getParentStatus(updatedItems, prev.bundles),
        };
      });
    } catch (err) {
      console.error(err);
      alert("Failed to cancel service");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending_payment: "bg-yellow-100 text-yellow-800 border-yellow-200",

      documents_pending: "bg-orange-100 text-orange-800 border-orange-200",

      documents_uploaded: "bg-blue-100 text-blue-800 border-blue-200",

      in_progress: "bg-indigo-100 text-indigo-800 border-indigo-200",

      completed: "bg-green-100 text-green-800 border-green-200",

      cancelled: "bg-red-100 text-red-800 border-red-200",
    };

    const cls = map[status] ?? "bg-gray-100 text-gray-700 border-gray-200";

    return `inline-flex items-center px-3 py-1 rounded-full border text-xs font-semibold uppercase ${cls}`;
  };

  if (loading) {
    return <div className="grid min-h-[65vh] place-items-center bg-gradient-to-br from-[#fdf8ff] via-white to-[#fff5f8]"><span className="flex flex-col items-center gap-3 text-sm font-bold text-[#852BAF]"><span className="h-9 w-9 animate-spin rounded-full border-4 border-purple-100 border-t-[#852BAF]" />Loading service order...</span></div>;
  }

  if (error) {
    return <div className="grid min-h-[65vh] place-items-center bg-gradient-to-br from-[#fdf8ff] via-white to-[#fff5f8] p-6 text-center"><div><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-500"><FiFileText size={24} /></div><h2 className="mt-4 text-xl font-extrabold text-slate-900">Order unavailable</h2><p className="mt-1 text-sm text-slate-500">{error}</p><button onClick={() => navigate(-1)} className="mt-5 rounded-xl bg-[#852BAF] px-5 py-2.5 text-sm font-bold text-white">Return to orders</button></div></div>;
  }

  if (!data) {
    return null;
  }

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-[#fdf8ff] via-white to-[#fff5f8] p-4 sm:p-6 lg:p-8"
      style={{
        background:
          "linear-gradient(160deg, #fdf8ff 0%, #fff5f8 50%, #f8f9ff 100%)",
      }}
    >
      {/* HEADER */}
      <div className="relative mb-6 flex items-center justify-between overflow-hidden rounded-3xl bg-gradient-to-br from-[#25103d] via-[#68258d] to-[#c33076] p-6 text-white shadow-[0_24px_65px_rgba(91,33,124,0.24)] sm:p-8">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/20"
        >
          ← Back
        </button>

        <h2 className="text-2xl font-extrabold text-white md:text-3xl">
          Service Order
        </h2>
      </div>

      {/* ORDER SUMMARY */}
      <div className="mb-5 rounded-3xl border border-purple-100 bg-white p-6 shadow-[0_18px_55px_rgba(67,31,91,0.08)]">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
          Order Summary
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <span className="text-xs text-gray-400">Parent Order ID</span>

            <p className="mt-1 font-semibold text-gray-800 break-all">
              {data.parent_order_id}
            </p>
          </div>

          <div>
            <span className="text-xs text-gray-400">Status</span>

            <div className="mt-2">
              <span className={getStatusBadge(data.status)}>
                {data.status.replaceAll("_", " ")}
              </span>
            </div>
          </div>

          <div>
            <span className="text-xs text-gray-400">Created On</span>

            <p className="mt-1 font-semibold text-gray-800">
              {new Date(data.created_at).toLocaleDateString("en-IN")}
            </p>
          </div>

          <div>
            <span className="text-xs text-gray-400">Total Amount</span>

            <p className="mt-1 text-xl font-bold text-[#852BAF]">
              {formatCurrency(data.total_amount)}
            </p>
          </div>
        </div>
      </div>

      {/* CUSTOMER */}
      <div className="mb-5 rounded-3xl border border-purple-100 bg-white p-6 shadow-[0_18px_55px_rgba(67,31,91,0.08)]">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
          Customer Details
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <span className="text-xs text-gray-400">Name</span>

            <p className="mt-1 font-semibold text-gray-800">
              {data.customer.name}
            </p>
          </div>

          <div>
            <span className="text-xs text-gray-400">Email</span>

            <p className="mt-1 font-semibold text-gray-800">
              {data.customer.email}
            </p>
          </div>

          <div>
            <span className="text-xs text-gray-400">Mobile</span>

            <p className="mt-1 font-semibold text-gray-800">
              {data.customer.mobile}
            </p>
          </div>
        </div>
      </div>

      {/* ADDRESS */}
      {data.address && (
        <div className="mb-5 rounded-3xl border border-purple-100 bg-white p-6 shadow-[0_18px_55px_rgba(67,31,91,0.08)]">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
            Service Address
          </h3>

          <p className="font-semibold text-gray-800">
            {data.address.contact_name}
          </p>

          <p className="text-gray-600 text-sm">{data.address.contact_phone}</p>

          <p className="text-gray-600 text-sm mt-2">
            {data.address.address1}
            {data.address.address2 ? `, ${data.address.address2}` : ""}
          </p>

          <p className="text-gray-600 text-sm">
            {data.address.city}, {data.address.state}, {data.address.country} -{" "}
            {data.address.zipcode}
          </p>

          {data.address.landmark && (
            <p className="text-sm text-gray-400 mt-2">
              Landmark: {data.address.landmark}
            </p>
          )}
        </div>
      )}

      {/* CUSTOMER DOCUMENTS */}
      <div className="mb-5 rounded-3xl border border-purple-100 bg-white p-6 shadow-[0_18px_55px_rgba(67,31,91,0.08)]">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
          Customer Documents
        </h3>

        {data.documents?.length ? (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-purple-50/60">
                <tr>
                  {["Document", "Document Number", "Uploaded On", "Expiry", "File"].map(
                    (heading) => (
                      <th
                        key={heading}
                        className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-left text-gray-500"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.documents.map((document) => (
                  <tr key={document.id} className="hover:bg-purple-50/30">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800">
                        {document.document_name}
                      </p>
                      {document.is_mandatory && (
                        <span className="text-xs text-red-500">Mandatory</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {document.document_number || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {document.uploaded_at
                        ? new Date(document.uploaded_at).toLocaleDateString(
                            "en-IN",
                          )
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {document.expiry_date
                        ? new Date(document.expiry_date).toLocaleDateString(
                            "en-IN",
                          )
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {document.file_url ? (
                        <a
                          href={document.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-[#852BAF] hover:bg-[#6f2492]"
                        >
                          View Document
                        </a>
                      ) : (
                        "Unavailable"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            No documents have been uploaded for this order.
          </p>
        )}
      </div>

      {/* SERVICE ITEMS */}
      <div className="mb-5 rounded-3xl border border-purple-100 bg-white p-6 shadow-[0_18px_55px_rgba(67,31,91,0.08)]">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-5">
          Service Items
        </h3>

        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead
              style={{
                background: "linear-gradient(135deg, #fdf8ff 0%, #fff5f8 100%)",
              }}
            >
              <tr>
                {[
                  "Order Ref",
                  "Service",
                  "Variant",
                  "Price",
                  "Timeline",
                  "Status / Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-left text-gray-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {data.items.map((item) => (
                <tr key={item.id} className="hover:bg-purple-50/30">
                  <td className="px-4 py-3 font-semibold">{item.order_ref}</td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {item.image_url && (
                        <img
                          src={item.image_url}
                          alt={item.service_name}
                          className="w-12 h-12 rounded-lg object-cover border"
                        />
                      )}

                      <div>
                        <p className="font-semibold text-gray-800">
                          {item.service_name}
                        </p>

                        <p className="text-xs text-gray-500">{item.title}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">{item.variant_name}</td>

                  <td className="px-4 py-3 font-semibold">
                    {formatCurrency(item.price)}
                  </td>

                  <td className="px-4 py-3">
                    <ServiceItemTimeline timeline={item.timeline} />
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      <span className={getStatusBadge(item.status)}>
                        {item.status.replaceAll("_", " ")}
                      </span>
                      <select
                        value=""
                        disabled={
                          item.status === "completed" ||
                          item.status === "cancelled" ||
                          updatingStatus
                        }
                        onChange={(e) =>
                          updateServiceStatus(item.id, e.target.value)
                        }
                        className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
                      >
                        <option value="" disabled>
                          Choose action
                        </option>
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {status.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>

                      {item.status !== "cancelled" && (
                          <button
                            onClick={() => cancelService(item.id)}
                            disabled={item.status === "completed" || updatingStatus}
                            title={item.status === "completed" ? "Completed services cannot be cancelled" : "Cancel this service"}
                            className="px-3 py-1 text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                          >
                            {item.status === "completed" ? "Cancellation unavailable" : "Cancel Service"}
                          </button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* BUNDLES */}
      {data.bundles.length > 0 && (
        <div className="mb-5 rounded-3xl border border-purple-100 bg-white p-6 shadow-[0_18px_55px_rgba(67,31,91,0.08)]">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
            Bundles
          </h3>

          {data.bundles.map((bundle) => (
            <div key={bundle.bundle_id} className="border rounded-xl p-4 mb-4">
              <div className="font-semibold text-[#852BAF] mb-3">
                Bundle #{bundle.bundle_id}
              </div>

              <div className="space-y-2">
                {bundle.items.map((item) => (
                  <div key={item.id} className="grid items-center gap-4 rounded-xl bg-slate-50 p-3 text-sm md:grid-cols-[1fr_300px_auto]">
                    <div><span className="font-semibold text-slate-700">{item.service_name}</span><div className="mt-2"><span className={getStatusBadge(item.status)}>{item.status.replaceAll("_", " ")}</span></div></div>
                    <ServiceItemTimeline timeline={item.timeline} />
                    <span className="font-bold text-[#852BAF]">{formatCurrency(item.price)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t text-right font-bold">
                Bundle Total: {formatCurrency(bundle.bundle_total)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TOTAL */}
      <div className="rounded-3xl border border-purple-100 bg-gradient-to-r from-white to-purple-50 p-6 shadow-[0_18px_55px_rgba(67,31,91,0.08)]">
        <div className="flex justify-between items-center">
          <span className="text-lg font-semibold text-gray-700">
            Grand Total
          </span>

          <span className="text-2xl font-bold text-[#852BAF]">
            {formatCurrency(data.total_amount)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ServiceOrderView;
