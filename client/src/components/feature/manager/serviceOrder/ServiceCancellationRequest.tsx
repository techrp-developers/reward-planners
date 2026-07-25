import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiRefreshCw, FiXCircle } from "react-icons/fi";
import { api } from "../../../../api/api";

interface ServiceCancellationRequestItem {
  service_order_id: number;
  order_ref: string;
  parent_order_id: string;
  service_name: string;
  customer_name: string;
  price: number;
  reason: string | null;
  comment: string | null;
  status: "requested" | "approved" | "rejected";
  refund_status: string;
  order_status: string;
  created_at: string;
}

interface ServiceCancellationListResponse {
  success: boolean;
  requests: ServiceCancellationRequestItem[];
  total: number;
  page: number;
  totalPages: number;
}

const statuses = ["requested", "approved", "rejected", "all"] as const;

export default function ServiceCancellationRequest() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState<ServiceCancellationRequestItem[]>([]);
  const [status, setStatus] = useState<(typeof statuses)[number]>("requested");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<ServiceCancellationListResponse>(
        "/order/service-cancellation-requests",
        { params: { status, page, limit: 20 } },
      );
      setRequests(response.data.requests || []);
      setTotalPages(Math.max(1, response.data.totalPages || 1));
    } catch (requestError) {
      console.error("Unable to fetch service cancellations", requestError);
      setError("Unable to load service cancellation requests.");
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(Number(amount || 0));

  const formatDate = (value: string) =>
    new Date(value).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="min-h-screen w-full">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-[#852BAF] to-[#FC3F78] shadow-md">
              <FiXCircle className="text-xl text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Service Cancellations</h1>
              <p className="mt-1 text-sm text-gray-500">
                Review customer requests and decide whether service work should stop.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fetchRequests}
            disabled={loading}
            className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-purple-200 px-4 py-2 text-sm font-semibold text-[#852BAF] hover:bg-purple-50 disabled:opacity-50"
          >
            <FiRefreshCw className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {statuses.map((option) => (
            <button
              type="button"
              key={option}
              onClick={() => {
                setStatus(option);
                setPage(1);
              }}
              className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold capitalize transition ${
                status === option
                  ? "bg-gradient-to-r from-[#852BAF] to-[#FC3F78] text-white shadow"
                  : "border border-gray-200 bg-white text-gray-600 hover:border-purple-200 hover:text-[#852BAF]"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gradient-to-r from-purple-50 to-pink-50">
              <tr>
                {[
                  "Order",
                  "Service",
                  "Customer",
                  "Amount",
                  "Reason",
                  "Requested",
                  "Status",
                  "Action",
                ].map((heading) => (
                  <th key={heading} className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-gray-500">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 bg-white">
              {loading ? (
                <tr><td colSpan={8} className="py-16 text-center text-sm text-gray-400">Loading requests…</td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={8} className="py-16 text-center text-sm text-gray-400">No {status === "all" ? "" : status} service cancellation requests.</td></tr>
              ) : (
                requests.map((request) => (
                  <tr key={request.service_order_id} className="hover:bg-purple-50/30">
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-[#852BAF]">{request.order_ref}</p>
                      <p className="mt-1 text-xs text-gray-400">#{request.service_order_id}</p>
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-gray-700">{request.service_name}</td>
                    <td className="px-5 py-4 text-sm text-gray-700">{request.customer_name}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-gray-900">{formatCurrency(request.price)}</td>
                    <td className="max-w-[220px] px-5 py-4">
                      <p className="truncate text-sm text-gray-700">{request.reason || "Not provided"}</p>
                      {request.comment && <p className="mt-1 truncate text-xs text-gray-400">{request.comment}</p>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-500">{formatDate(request.created_at)}</td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                        request.status === "requested"
                          ? "bg-amber-100 text-amber-700"
                          : request.status === "approved"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                      }`}>
                        {request.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => navigate(`/manager/service-cancellation-detail/${request.service_order_id}`)}
                        className="cursor-pointer rounded-lg border border-purple-200 bg-purple-50 px-4 py-1.5 text-sm font-semibold text-[#852BAF] hover:bg-[#852BAF] hover:text-white"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)} className="cursor-pointer rounded-lg border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Previous</button>
            <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)} className="cursor-pointer rounded-lg border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
