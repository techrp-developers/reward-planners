import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../../../common/api/api";
import OrderStatusTimeline, { type ShipmentProgress } from "../../components/OrderStatusTimeline";

interface Order {
  order_id: number;
  order_ref: string;
  status: string;
  total_amount: number;
  vendor_total: number;
  product_total: number;
  reward_discount: number;
  reward_coins_used: number;
  reward_coins_earned: number;
  shipping_total: number;
  created_at: string;
}

interface Customer {
  user_id: number;
  name: string;
  email: string;
  phone: string;
}

interface Company {
  company_id: number;
  company_name: string;
}

interface Address {
  type: string;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  country: string;
  zipcode: string;
  landmark: string;
}

interface OrderItem {
  order_item_id: number;
  product_id: number;
  variant_id: number;
  product_name: string;
  brand_name: string;
  image: string | null;
  attributes: Record<string, string>;
  quantity: number;
  price: number;
  item_total: number;
}

interface OrderSummary {
  item_total: number;
  order_total: number;
}

interface OrderDetailsResponse {
  success: boolean;
  order: Order;
  customer: Customer;
  company: Company | null;
  address: Address;
  items: OrderItem[];
  summary: OrderSummary;
  shipments: ShipmentProgress[];
  vendor_breakdown: Array<{ vendor_order_id: number; vendor_id: number; vendor_name: string; vendor_total: number; delivery_charge: number; shipping_status: string }>;
}

const OrderView: React.FC = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState<OrderDetailsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  const fetchOrderDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.get<OrderDetailsResponse>(
        `/order/order-details/${orderId}`,
      );

      if (!res.data.success) {
        throw new Error("Failed to load order");
      }

      setData(res.data);
    } catch (err) {
      console.error("Failed to fetch order details", err);
      setError("Unable to load order details.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (orderId) {
      fetchOrderDetails();
    }
  }, [fetchOrderDetails, orderId]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);

  const downloadInvoice = async () => {
    if (!orderId || downloadingInvoice) return;

    try {
      setDownloadingInvoice(true);
      const response = await api.get(`/order/invoice/${orderId}`, {
        responseType: "blob",
      });
      const disposition = response.headers["content-disposition"] as string | undefined;
      const fileName = disposition?.match(/filename="?([^";]+)"?/i)?.[1]
        ?? `invoice-${data?.order.order_ref || orderId}.pdf`;
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download invoice", err);
      window.alert("Invoice is not available for this order yet.");
    } finally {
      setDownloadingInvoice(false);
    }
  };

  if (loading) return <div style={{ padding: 20 }}>Loading order...</div>;
  if (error) return <div style={{ padding: 20, color: "red" }}>{error}</div>;
  if (!data) return null;

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
    return `inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-semibold capitalize ${cls}`;
  };

  return (
  <div className="min-h-screen p-6 md:p-10" style={{ background: "linear-gradient(160deg, #fdf8ff 0%, #fff5f8 50%, #f8f9ff 100%)" }}>

    {/* HEADER */}
    <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
      <button
        className="inline-flex items-center gap-2 text-sm font-semibold
        bg-gradient-to-r from-[#852BAF] to-[#FC3F78] text-white
        px-5 py-2.5 rounded-xl shadow-lg hover:scale-[1.03] active:scale-95 transition cursor-pointer"
        onClick={() => navigate(-1)}
      >
        ← Back
      </button>

      <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
        Order #{data.order.order_ref}
      </h2>

      <button
        type="button"
        onClick={downloadInvoice}
        disabled={downloadingInvoice}
        className="inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-white px-5 py-2.5 text-sm font-bold text-[#852BAF] shadow-sm transition hover:-translate-y-0.5 hover:border-[#852BAF] hover:shadow-md disabled:cursor-wait disabled:opacity-60"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
        </svg>
        {downloadingInvoice ? "Preparing invoice..." : "Download Invoice"}
      </button>
    </div>

    {/* ORDER INFO */}
    <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-5">
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Order Summary</h3>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        <div>
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Status</span>
          <div className="mt-2">
            <span className={getStatusBadge(data.order.status)}>{data.order.status}</span>
          </div>
        </div>
        <div>
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Date</span>
          <p className="mt-2 font-semibold text-gray-800">
            {new Date(data.order.created_at).toLocaleDateString("en-IN")}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Total</span>
          <p className="mt-2 text-xl font-bold text-[#852BAF]">
            {formatCurrency(data.order.total_amount)}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-400 font-medium uppercase tracking-wide">Vendor Total</span>
          <p className="mt-2 text-xl font-bold text-[#FC3F78]">
            {formatCurrency(data.order.vendor_total)}
          </p>
        </div>
      </div>
    </div>

    <OrderStatusTimeline shipments={data.shipments || []} />

    {/* FINANCIAL BREAKDOWN */}
    <div className="my-5 overflow-hidden rounded-3xl border border-purple-100 bg-white shadow-[0_14px_45px_rgba(67,31,91,0.08)]">
      <div className="border-b border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 px-6 py-5">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#852BAF]">Order accounting</p>
        <h3 className="mt-1 text-lg font-extrabold text-gray-900">Financial Breakdown</h3>
        <p className="mt-1 text-xs text-gray-500">Vendor allocation excludes delivery charges.</p>
      </div>
      <div className="grid gap-6 p-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl border border-gray-100 bg-gray-50/70 p-5">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-gray-600"><span>Product subtotal</span><span className="font-bold text-gray-900">{formatCurrency(data.order.product_total)}</span></div>
            <div className="flex justify-between text-emerald-700"><span>Reward discount</span><span className="font-bold">− {formatCurrency(data.order.reward_discount)}</span></div>
            <div className="flex justify-between border-t border-gray-200 pt-3 text-gray-700"><span>Combined vendor total</span><span className="font-extrabold text-[#852BAF]">{formatCurrency(data.order.vendor_total)}</span></div>
            <div className="flex justify-between text-gray-600"><span>Delivery charges</span><span className="font-bold text-gray-900">+ {formatCurrency(data.order.shipping_total)}</span></div>
            <div className="flex justify-between border-t border-purple-100 pt-4 text-base"><span className="font-extrabold text-gray-900">Customer paid total</span><span className="text-xl font-black text-[#FC3F78]">{formatCurrency(data.order.total_amount)}</span></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-purple-50 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-purple-500">Reward coins used</p><p className="mt-1 font-extrabold text-purple-800">{data.order.reward_coins_used.toLocaleString("en-IN")}</p></div>
            <div className="rounded-xl bg-emerald-50 px-4 py-3"><p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Reward coins earned</p><p className="mt-1 font-extrabold text-emerald-800">{data.order.reward_coins_earned.toLocaleString("en-IN")}</p></div>
          </div>
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-700">Amount outside vendor allocation: <strong>{formatCurrency(data.order.total_amount - data.order.vendor_total)}</strong>, currently represented by delivery charges.</div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-gray-100">
          <div className="border-b border-gray-100 px-4 py-3"><h4 className="text-sm font-extrabold text-gray-900">Vendor allocation</h4><p className="text-xs text-gray-400">How much each vendor receives from merchandise.</p></div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-purple-50/60 text-[10px] font-bold uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Vendor total</th><th className="px-4 py-3">Delivery</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-gray-100">{(data.vendor_breakdown || []).map((vendor) => <tr key={vendor.vendor_order_id}><td className="px-4 py-3 font-bold text-gray-800">{vendor.vendor_name}</td><td className="px-4 py-3 font-extrabold text-[#852BAF]">{formatCurrency(vendor.vendor_total)}</td><td className="px-4 py-3 text-gray-600">{formatCurrency(vendor.delivery_charge)}</td><td className="px-4 py-3"><span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-bold capitalize text-purple-700">{vendor.shipping_status.replaceAll("_", " ")}</span></td></tr>)}</tbody></table></div>
        </div>
      </div>
    </div>

    {/* CUSTOMER */}
    <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-5">
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Customer Details</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <span className="text-xs text-gray-400 font-medium">Name</span>
          <p className="mt-1 font-semibold text-gray-800">{data.customer.name}</p>
        </div>
        <div>
          <span className="text-xs text-gray-400 font-medium">Email</span>
          <p className="mt-1 font-semibold text-gray-800">{data.customer.email}</p>
        </div>
        <div>
          <span className="text-xs text-gray-400 font-medium">Phone</span>
          <p className="mt-1 font-semibold text-gray-800">{data.customer.phone}</p>
        </div>
      </div>
    </div>

    {/* COMPANY */}
    {data.company && (
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-5">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-2">Company</h3>
        <p className="font-semibold text-gray-800">{data.company.company_name}</p>
      </div>
    )}

    {/* ADDRESS */}
    <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-5">
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Shipping Address</h3>
      <p className="font-semibold text-gray-800">{data.address.name}</p>
      <p className="text-gray-600 text-sm mt-1">{data.address.phone}</p>
      <p className="text-gray-600 text-sm">{data.address.line1}{data.address.line2 ? `, ${data.address.line2}` : ""}</p>
      <p className="text-gray-600 text-sm">
        {data.address.city}, {data.address.state}, {data.address.country} — {data.address.zipcode}
      </p>
      {data.address.landmark && (
        <p className="text-sm text-gray-400 mt-2">Landmark: {data.address.landmark}</p>
      )}
    </div>

    {/* ITEMS */}
    <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-5">Order Items</h3>

      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full text-sm">
          <thead style={{ background: "linear-gradient(135deg, #fdf8ff 0%, #fff5f8 100%)" }}>
            <tr>
              {["Product", "Brand", "Attributes", "Qty", "Price", "Total"].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-bold uppercase text-gray-500 text-left tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.items.map((item) => (
              <tr key={item.order_item_id} className="hover:bg-purple-50/30 transition-colors">
                <td className="px-4 py-3 font-semibold text-gray-800">{item.product_name}</td>
                <td className="px-4 py-3 text-gray-600">{item.brand_name}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {Object.entries(item.attributes).map(([key, value]) => (
                    <div key={key}><span className="font-medium text-gray-700">{key}:</span> {value}</div>
                  ))}
                </td>
                <td className="px-4 py-3 text-gray-700">{item.quantity}</td>
                <td className="px-4 py-3 text-gray-700">{formatCurrency(item.price)}</td>
                <td className="px-4 py-3 font-bold text-[#852BAF]">{formatCurrency(item.item_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* SUMMARY */}
      <div className="mt-6 border-t border-gray-100 pt-5 space-y-3 text-sm">
        <div className="flex justify-between text-gray-600">
          <span>Items Total</span>
          <span className="font-semibold text-gray-800">{formatCurrency(data.summary.item_total)}</span>
        </div>
        <div className="flex justify-between text-base font-bold">
          <span className="text-gray-800">Order Total</span>
          <span className="text-[#852BAF] text-lg">{formatCurrency(data.summary.order_total)}</span>
        </div>
      </div>
    </div>
  </div>
);
};

export default OrderView;
