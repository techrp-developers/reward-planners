import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../../common/api/api";
import { FiShoppingCart } from "react-icons/fi";

interface Order {
  order_id: number;
  order_ref: string;
  total_amount: number;
  status: string;
  created_at: string;
  item_count: number;
  product_name: string | null;
  brand_name: string | null;
  awb_number?: string;
}

interface OrderListResponse {
  success: boolean;
  orders: Order[];
  totalPages: number;
}

const OrderList: React.FC = () => {
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const limit = 10;

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.get<OrderListResponse>("/order/order-list", {
        params: { page, limit },
      });

      if (!res.data.success) throw new Error();

      setOrders(res.data.orders);
      setTotalPages(res.data.totalPages);
    } catch {
      setError("Unable to load orders.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [page]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending:    "bg-yellow-100 text-yellow-800 border-yellow-200",
      completed:  "bg-green-100  text-green-800  border-green-200",
      delivered:  "bg-green-100  text-green-800  border-green-200",
      cancelled:  "bg-red-100    text-red-800    border-red-200",
      processing: "bg-blue-100   text-blue-800   border-blue-200",
      shipped:    "bg-indigo-100 text-indigo-800 border-indigo-200",
    };
    const cls = map[status.toLowerCase()] ?? "bg-gray-100 text-gray-700 border-gray-200";
    return `inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-semibold uppercase tracking-wide ${cls}`;
  };

  return (
    <div className="w-full min-h-screen">
      <div className="p-6 bg-white border border-gray-200 shadow-lg rounded-2xl">

        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <div className="w-12 h-12 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-full flex items-center justify-center shrink-0 shadow-md">
            <FiShoppingCart className="text-xl text-white" />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-gray-900">Order List</h2>
            <p className="mt-1 text-sm text-gray-500">Manage and monitor all customer orders</p>
          </div>
        </div>

        {/* States */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-gray-200 border-t-[#852BAF] rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <p className="px-4 py-3 mb-4 text-red-600 border border-red-200 bg-red-50 rounded-xl">{error}</p>
        )}

        {!loading && !error && (
          <>
            {/* Table */}
            <div className="overflow-hidden border border-gray-100 rounded-2xl">
              <table className="min-w-full divide-y divide-gray-100">
                <thead style={{ background: "linear-gradient(135deg, #fdf8ff 0%, #fff5f8 100%)" }}>
                  <tr>
                    {["Order Ref", "Product", "Brand", "Total", "Status", "Date", "Items", "Action"].map((h) => (
                      <th key={h} className="px-5 py-4 text-xs font-bold tracking-wider text-left text-gray-500 uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="bg-white divide-y divide-gray-50">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-sm text-center text-gray-400">
                        No orders found
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr key={order.order_id} className="transition-colors hover:bg-purple-50/30">
                        <td className="px-5 py-4">
                          <a
                            href={`/crm/manager/order-view/${order.order_id}`}
                            className="font-semibold text-[#852BAF] hover:underline"
                          >
                            {order.order_ref}
                          </a>
                          {order.awb_number && (
                            <div className="text-xs text-gray-400 mt-0.5">AWB: {order.awb_number}</div>
                          )}
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-700">{order.product_name ?? "-"}</td>

                        <td className="px-5 py-4 text-sm text-gray-700">{order.brand_name ?? "-"}</td>

                        <td className="px-5 py-4 text-sm font-semibold text-gray-900">
                          {formatCurrency(order.total_amount)}
                        </td>

                        <td className="px-5 py-4">
                          <span className={getStatusBadge(order.status)}>{order.status}</span>
                        </td>

                        <td className="px-5 py-4 text-sm text-gray-600">
                          {new Date(order.created_at).toLocaleDateString("en-IN")}
                        </td>

                        <td className="px-5 py-4 text-sm text-center text-gray-700">{order.item_count}</td>

                        <td className="px-5 py-4">
                          <button
                            onClick={() => navigate(`/manager/order-view/${order.order_id}`)}
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

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 mt-6 bg-white border border-gray-100 shadow-sm rounded-xl">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-4 py-2 text-sm font-medium bg-white border rounded-lg cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                ← Prev
              </button>

              <span className="text-sm font-medium text-gray-600">
                Page {page} of {totalPages}
              </span>

              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-4 py-2 text-sm font-medium bg-white border rounded-lg cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Next →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OrderList;
