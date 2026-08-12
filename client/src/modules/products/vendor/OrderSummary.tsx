import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../../common/api/api";
import { FiArrowUpRight, FiBox, FiCheckCircle, FiClock, FiPackage, FiShoppingCart, FiTrendingUp } from "react-icons/fi";
import VendorFleaMarketPurchasesPage from "./VendorFleaMarketPurchasesPage";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") === "flea-market" ? "flea-market" : "online";

  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const limit = 10;

  const fetchOrders = useCallback(async () => {
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
  }, [page]);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);

  const visibleVendorTotal = orders.reduce((sum, order) => sum + Number(order.vendor_total || 0), 0);
  const deliveredOrders = orders.filter((order) => order.shipping_status.toLowerCase() === "delivered").length;
  const activeOrders = orders.filter((order) => !["delivered", "cancelled"].includes(order.shipping_status.toLowerCase())).length;

  return (
    <div>
      {/* PAGE HEADER */}
      <div
        className="relative mb-6 overflow-hidden rounded-3xl p-6 sm:p-7"
        style={{
          background: "linear-gradient(120deg, #25103d 0%, #64248c 52%, #b72f72 100%)",
          boxShadow: "0 18px 45px rgba(83,31,111,0.2)",
        }}
      >
        <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/15 shadow-lg backdrop-blur-sm">
              <FiShoppingCart className="text-xl text-white" />
            </div>
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.22em] text-purple-200">Vendor commerce</p>
              <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">Orders</h2>
              <p className="mt-1 text-sm font-medium text-purple-100/80">Track purchases, fulfillment and revenue in one place.</p>
            </div>
          </div>
          <div className="hidden rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-right backdrop-blur-sm sm:block">
            <p className="text-[10px] font-bold uppercase tracking-widest text-purple-200">Total orders</p>
            <p className="mt-0.5 text-2xl font-extrabold text-white">{orders.length}</p>
          </div>
        </div>
      </div>

      <div
        className="mb-6 flex w-full gap-2 rounded-2xl bg-white p-2 sm:w-fit"
        style={{ border: "1px solid rgba(133,43,175,0.1)", boxShadow: "0 4px 20px rgba(133,43,175,0.06)" }}
        role="tablist"
        aria-label="Order channels"
      >
        {[
          { id: "online", label: "Online Orders", Icon: FiShoppingCart },
          { id: "flea-market", label: "Flea Market Purchases", Icon: FiBox },
        ].map(({ id, label, Icon }) => {
          const selected = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSearchParams(id === "online" ? {} : { tab: "flea-market" })}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all sm:flex-none ${
                selected ? "text-white shadow-md" : "text-gray-500 hover:bg-purple-50 hover:text-[#852BAF]"
              }`}
              style={selected ? { background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" } : undefined}
            >
              <Icon size={16} />
              {label}
            </button>
          );
        })}
      </div>

      {activeTab === "flea-market" ? (
        <VendorFleaMarketPurchasesPage embedded />
      ) : (
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: "Page vendor total", value: formatCurrency(visibleVendorTotal), Icon: FiTrendingUp, tint: "text-purple-700 bg-purple-50" },
            { label: "Active orders", value: activeOrders.toLocaleString(), Icon: FiClock, tint: "text-amber-700 bg-amber-50" },
            { label: "Delivered", value: deliveredOrders.toLocaleString(), Icon: FiCheckCircle, tint: "text-emerald-700 bg-emerald-50" },
          ].map(({ label, value, Icon, tint }) => (
            <div key={label} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-[0_8px_30px_rgba(52,22,68,0.06)]">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{label}</p><p className="mt-1.5 text-xl font-extrabold text-gray-900">{value}</p></div>
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tint}`}><Icon size={19} /></div>
              </div>
            </div>
          ))}
        </div>
      <div
        className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-[0_12px_38px_rgba(52,22,68,0.08)]"
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
                  <tr className="border-b border-purple-100 bg-gradient-to-r from-purple-50/90 to-pink-50/60">
                    {["Order Ref", "Vendor Total", "Status", "Date", "Items", "Action"].map((h) => (
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
                          <td className="px-5 py-5 font-semibold text-gray-900">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-pink-100 text-[#852BAF]"><FiPackage size={17} /></div>
                              <div><p className="font-extrabold">#{order.order_ref}</p>
                            {order.awb_number && (
                              <div className="mt-0.5 text-[11px] font-medium text-indigo-500">
                                AWB: {order.awb_number}
                              </div>
                            )}</div></div>
                          </td>

                          <td className="px-5 py-4 font-bold text-gray-800">
                            {formatCurrency(order.vendor_total)}
                          </td>

                          <td className="px-5 py-4">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold capitalize ${bg} ${text}`}>
                              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{order.shipping_status}
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
                              className="group inline-flex cursor-pointer items-center gap-2 rounded-xl border border-purple-200 bg-white px-3.5 py-2 text-xs font-bold text-[#852BAF] shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#852BAF] hover:bg-purple-50 hover:shadow-md"
                              onClick={() => navigate(`/vendor/orders/details/${order.vendor_order_id}`)}
                            >
                              View order <FiArrowUpRight className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" size={14} />
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
      )}
    </div>
  );
};

export default OrderSummary;
