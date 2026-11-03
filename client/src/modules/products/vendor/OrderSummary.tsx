import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../../common/api/api";
import { FiCheckCircle, FiClock, FiTrendingUp } from "react-icons/fi";
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

const statusStyles: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  paid: "bg-blue-50 text-blue-700",
  shipped: "bg-blue-50 text-blue-700",
  delivered: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-50 text-red-700",
};

const getStatusStyle = (status: string) => statusStyles[status.toLowerCase()] ?? "bg-gray-100 text-gray-700";

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
    <div className="space-y-5 pb-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Orders</h1>
        <p className="mt-1 text-sm text-slate-500">Track purchases, fulfilment and revenue.</p>
      </header>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Order channels">
        {[
          { id: "online", label: "Online orders" },
          { id: "flea-market", label: "Flea market purchases" },
        ].map(({ id, label }) => {
          const selected = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSearchParams(id === "online" ? {} : { tab: "flea-market" })}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${selected ? "bg-[#852BAF] text-white" : "border border-gray-200 bg-white text-gray-600"}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {activeTab === "flea-market" ? (
        <VendorFleaMarketPurchasesPage embedded />
      ) : (
      <div className="space-y-5">
        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Total on this page", value: formatCurrency(visibleVendorTotal), Icon: FiTrendingUp, tint: "bg-purple-50 text-[#852BAF]" },
            { label: "Active", value: activeOrders.toLocaleString(), Icon: FiClock, tint: "bg-amber-50 text-amber-700" },
            { label: "Delivered", value: deliveredOrders.toLocaleString(), Icon: FiCheckCircle, tint: "bg-emerald-50 text-emerald-700" },
          ].map(({ label, value, Icon, tint }) => (
            <article key={label} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{value}</p></div>
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${tint}`}><Icon size={18} /></span>
              </div>
            </article>
          ))}
        </section>

        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-5 py-3">Order</th>
                  <th className="px-5 py-3">Vendor total</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Items</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-5 py-14 text-center text-gray-500">Loading orders…</td></tr>
                ) : error ? null : orders.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-14 text-center text-gray-500">No orders found.</td></tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.vendor_order_id} className="hover:bg-gray-50">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-gray-900">#{order.order_ref}</p>
                        {order.awb_number && <p className="mt-0.5 text-xs text-gray-500">AWB {order.awb_number}{order.courier_name ? ` · ${order.courier_name}` : ""}</p>}
                      </td>
                      <td className="px-5 py-4 font-semibold text-gray-800">{formatCurrency(order.vendor_total)}</td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${getStatusStyle(order.shipping_status)}`}>{order.shipping_status}</span>
                      </td>
                      <td className="px-5 py-4 text-gray-600">
                        {new Date(order.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-5 py-4 text-gray-600">{order.item_count}</td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => navigate(`/vendor/orders/details/${order.vendor_order_id}`)}
                          className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:border-purple-300 hover:text-[#852BAF]"
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

          {!loading && !error && orders.length > 0 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-sm text-gray-500">
              <span>Page {page} of {totalPages}</span>
              <div className="flex gap-2">
                <button type="button" disabled={page === 1} onClick={() => setPage((prev) => prev - 1)} className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">Previous</button>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((prev) => prev + 1)} className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </section>
      </div>
      )}
    </div>
  );
};

export default OrderSummary;
