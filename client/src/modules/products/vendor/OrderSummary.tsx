import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../../common/api/api";
import { FiShoppingCart } from "react-icons/fi";

interface Order {
  vendor_order_id: number;
  order_id: number;
  order_ref: string;
  vendor_total: number;
  shipping_status: string;
  created_at: string;
  item_count: number;
  awb_number?: string;
  courier_name?: string;
}

interface OrderListResponse {
  success: boolean;
  orders: Order[];
  total: number;
}

const statusStyles: Record<string, { bg: string; text: string }> = {
  pending:   { bg: "bg-amber-100",   text: "text-amber-800" },
  paid:      { bg: "bg-blue-100",    text: "text-blue-800" },
  shipped:   { bg: "bg-indigo-100",  text: "text-indigo-700" },
  delivered: { bg: "bg-emerald-100", text: "text-emerald-700" },
  cancelled: { bg: "bg-red-100",     text: "text-red-700" },
};

const getStatusStyle = (status: string) =>
  statusStyles[status.toLowerCase()] ?? { bg: "bg-gray-100", text: "text-gray-700" };

const OrderSummary: React.FC = () => {
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

      const res = await api.get<OrderListResponse>("/order/order-summary", {
        params: { page, limit },
      });

      if (!res.data.success) {
        throw new Error("Failed to load orders");
      }

      setOrders(res.data.orders);
      setTotalPages(Math.max(1, Math.ceil(res.data.total / limit)));
    } catch (err) {
      console.error("Failed to fetch orders", err);
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

  return (
    <div>
      {/* PAGE HEADER */}
      <div
        className="flex items-center gap-4 mb-6 p-5 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
          style={{
            background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
            boxShadow: "0 6px 18px rgba(133,43,175,0.28)",
          }}
        >
          <FiShoppingCart className="text-white text-lg" />
        </div>
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            Orders <span className="gradient-text-brand">Summary</span>
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Manage and monitor all customer orders
          </p>
        </div>
      </div>

      {/* CARD WRAPPER */}
      <div
        className="bg-white rounded-3xl overflow-hidden"
        style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}
      >
        {/* Loader */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div
              className="w-10 h-10 rounded-full border-4 border-purple-100 border-t-[#852BAF] animate-spin"
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
            {error}
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr style={{ background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.03) 100%)" }}>
                    {["Order Ref", "Total", "Status", "Date", "Items", "Action"].map((h) => (
                      <th key={h} className="px-5 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-50">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-sm text-gray-400 font-medium">
                        No orders found
                      </td>
                    </tr>
                  ) : (
                    orders.map((order, index) => {
                      const { bg, text } = getStatusStyle(order.shipping_status);
                      return (
                        <tr
                          key={order.vendor_order_id}
                          className="row-animate hover:bg-purple-50/30 transition-colors duration-150"
                          style={{ animationDelay: `${index * 35}ms` }}
                        >
                          <td className="px-5 py-4 font-semibold text-gray-900">
                            {order.order_ref}
                            {order.awb_number && (
                              <div className="mt-1 text-xs font-medium text-indigo-500">
                                AWB: {order.awb_number}
                              </div>
                            )}
                          </td>

                          <td className="px-5 py-4 font-bold text-gray-800">
                            {formatCurrency(order.vendor_total)}
                          </td>

                          <td className="px-5 py-4">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold capitalize ${bg} ${text}`}>
                              {order.shipping_status}
                            </span>
                          </td>

                          <td className="px-5 py-4 text-gray-600">
                            {new Date(order.created_at).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </td>

                          <td className="px-5 py-4 text-gray-700">{order.item_count}</td>

                          <td className="px-5 py-4">
                            <button
                              className="action-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-[#852BAF] border cursor-pointer"
                              style={{ background: "#F3E8FF", borderColor: "rgba(133,43,175,0.3)" }}
                              onClick={() => navigate(`/vendor/orders/details/${order.vendor_order_id}`)}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {orders.length > 0 && (
              <div className="flex items-center justify-center gap-4 py-5 border-t border-gray-50">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((prev) => prev - 1)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
                >
                  ← Prev
                </button>

                <span className="text-sm font-semibold text-gray-500">
                  Page <span className="text-gray-900">{page}</span> of <span className="text-gray-900">{totalPages}</span>
                </span>

                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => prev + 1)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default OrderSummary;
