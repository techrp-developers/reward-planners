import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../api/api";
import { FiXCircle } from "react-icons/fi";

interface CancellationRequest {
  order_id: number;
  order_ref: string;
  customer_name: string;
  total_amount: number;
  reason_id: number;
  reason: string;
  comment: string | null;
  requested_at: string;
}

interface CancellationResponse {
  success: boolean;
  requests: CancellationRequest[];
}

const CancellationRequests: React.FC = () => {
  const navigate = useNavigate();

  const [requests, setRequests] = useState<CancellationRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.get<CancellationResponse>(
        "/order/cancellation-requests",
      );

      if (!res.data.success) {
        throw new Error("Failed to load requests");
      }

      setRequests(res.data.requests);
    } catch (err) {
      console.error("Failed to fetch cancellation requests", err);
      setError("Unable to load cancellation requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

  return (
    <div className="w-full min-h-screen">
      <div className="p-6 bg-white border border-gray-200 shadow-lg rounded-2xl">

        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-full flex items-center justify-center shrink-0 shadow-md">
            <FiXCircle className="text-xl text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Cancellation Requests</h2>
            <p className="mt-1 text-sm text-gray-500">Review and manage customer cancellation requests</p>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-[#852BAF] rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <p className="px-4 py-3 mb-4 text-red-600 border border-red-200 bg-red-50 rounded-xl">{error}</p>
        )}

        {!loading && !error && (
          <div className="overflow-hidden border border-gray-100 rounded-2xl">
            <table className="min-w-full divide-y divide-gray-100">
              <thead style={{ background: "linear-gradient(135deg, #fdf8ff 0%, #fff5f8 100%)" }}>
                <tr>
                  {["Order Ref", "Customer", "Total", "Reason", "Comment", "Date", "Action"].map((h) => (
                    <th key={h} className="px-5 py-4 text-xs font-bold tracking-wider text-left text-gray-500 uppercase">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="bg-white divide-y divide-gray-50">
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-sm text-center text-gray-400">
                      No cancellation requests
                    </td>
                  </tr>
                ) : (
                  requests.map((req) => (
                    <tr key={req.order_id} className="transition-colors hover:bg-purple-50/30">
                      <td className="px-5 py-4 font-semibold text-[#852BAF] text-sm">{req.order_ref}</td>

                      <td className="px-5 py-4 text-sm text-gray-700">{req.customer_name}</td>

                      <td className="px-5 py-4 text-sm font-semibold text-gray-900">
                        {formatCurrency(req.total_amount)}
                      </td>

                      <td className="px-5 py-4 text-sm text-gray-700">
                        #{req.reason_id} — {req.reason}
                      </td>

                      <td className="px-5 py-4 text-gray-500 text-sm max-w-[160px] truncate">
                        {req.comment ?? "-"}
                      </td>

                      <td className="px-5 py-4 text-sm text-gray-600">{formatDate(req.requested_at)}</td>

                      <td className="px-5 py-4">
                        <button
                          onClick={() => navigate(`/manager/cancellation-detail/${req.order_id}`)}
                          className="px-4 py-1.5 text-sm font-semibold bg-purple-50 text-[#852BAF] border border-purple-200 rounded-lg hover:bg-gradient-to-r hover:from-[#852BAF] hover:to-[#FC3F78] hover:text-white hover:border-transparent transition-all cursor-pointer"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CancellationRequests;
