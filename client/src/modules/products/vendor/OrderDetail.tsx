import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FiArrowLeft, FiBox, FiCalendar, FiCheckCircle, FiClock, FiCopy,
  FiMail, FiMapPin, FiPackage, FiPhone, FiShoppingBag, FiTruck, FiUser,
} from "react-icons/fi";
import { api } from "../../../common/api/api";
import OrderStatusTimeline, { type ShipmentProgress } from "../components/OrderStatusTimeline";

const statusStyles: Record<string, { badge: string; icon: React.ElementType }> = {
  pending: { badge: "border-amber-200 bg-amber-50 text-amber-700", icon: FiClock },
  paid: { badge: "border-blue-200 bg-blue-50 text-blue-700", icon: FiCheckCircle },
  shipped: { badge: "border-indigo-200 bg-indigo-50 text-indigo-700", icon: FiTruck },
  delivered: { badge: "border-emerald-200 bg-emerald-50 text-emerald-700", icon: FiCheckCircle },
  cancelled: { badge: "border-red-200 bg-red-50 text-red-700", icon: FiBox },
};

interface Order { vendor_order_id: number; vendor_total: number; shipping_status: string; created_at: string; order_id: number; order_ref: string; awb_number?: string; courier_name?: string; }
interface Customer { user_id: number; name: string; email: string; phone: string; }
interface Address { type: string; name: string; phone: string; line1: string; line2: string; city: string; state: string; country: string; zipcode: string; landmark?: string; }
interface OrderItem { order_item_id: number; product_id: number; variant_id: number; product_name: string; brand_name: string; image: string | null; attributes: Record<string, string>; quantity: number; price: number; item_total: number; }
interface Summary { item_total: number; vendor_total: number; }
interface VendorOrderDetailsResponse { success: boolean; order: Order; customer: Customer; address: Address; items: OrderItem[]; summary: Summary; shipments: ShipmentProgress[]; }

const money = (amount: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);
const dateTime = (value: string) => new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const OrderDetail: React.FC = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<VendorOrderDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchOrderDetails = useCallback(async () => {
    if (!orderId) return;
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<VendorOrderDetailsResponse>(`/order/order-view/${orderId}`);
      if (!response.data.success) throw new Error("Failed to load order");
      setData(response.data);
    } catch (requestError) {
      console.error("Failed to fetch vendor order details", requestError);
      setError("We couldn't load this order. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { void fetchOrderDetails(); }, [fetchOrderDetails]);

  if (loading) return (
    <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-purple-100 bg-white">
      <div className="text-center"><div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-purple-100 border-t-[#852BAF]" /><p className="mt-4 text-sm font-semibold text-gray-500">Preparing order details...</p></div>
    </div>
  );

  if (error || !data) return (
    <div className="rounded-3xl border border-red-100 bg-white p-10 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600"><FiBox size={21} /></div>
      <h2 className="mt-4 text-lg font-extrabold text-gray-900">Order unavailable</h2><p className="mt-1 text-sm text-gray-500">{error}</p>
      <button onClick={() => navigate("/vendor/orders/summary")} className="mt-5 rounded-xl bg-[#852BAF] px-4 py-2.5 text-sm font-bold text-white">Return to orders</button>
    </div>
  );

  const { order, customer, address, items, summary, shipments } = data;
  const status = statusStyles[order.shipping_status.toLowerCase()] ?? { badge: "border-gray-200 bg-gray-50 text-gray-700", icon: FiPackage };
  const StatusIcon = status.icon;
  const addressLine = [address.line1, address.line2, address.city, address.state, address.country, address.zipcode].filter(Boolean).join(", ");

  const copyReference = async () => {
    await navigator.clipboard.writeText(order.order_ref);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#25103d] via-[#64248c] to-[#b72f72] p-6 text-white shadow-[0_20px_55px_rgba(83,31,111,0.24)] sm:p-8">
        <div className="absolute -right-12 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <button onClick={() => navigate("/vendor/orders/summary")} className="mb-5 inline-flex items-center gap-2 text-xs font-bold text-purple-100 transition hover:text-white"><FiArrowLeft /> Back to all orders</button>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-purple-200">Order details</p>
            <div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">#{order.order_ref}</h1><button onClick={() => void copyReference()} aria-label="Copy order reference" className="rounded-lg border border-white/15 bg-white/10 p-2 text-purple-100 hover:bg-white/20"><FiCopy size={14} /></button><span className="text-xs font-semibold text-purple-100">{copied ? "Copied" : "Copy reference"}</span></div>
            <p className="mt-2 flex items-center gap-2 text-sm text-purple-100/80"><FiCalendar /> Placed {dateTime(order.created_at)}</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-sm sm:min-w-56">
            <p className="text-[10px] font-bold uppercase tracking-widest text-purple-200">Vendor total</p><p className="mt-1 text-3xl font-extrabold">{money(order.vendor_total)}</p>
            <span className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold capitalize ${status.badge}`}><StatusIcon />{order.shipping_status}</span>
          </div>
        </div>
      </section>

      <OrderStatusTimeline shipments={shipments || []} />

      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-[0_10px_35px_rgba(52,22,68,0.07)]">
          <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5"><div><p className="text-[11px] font-bold uppercase tracking-widest text-[#852BAF]">Order contents</p><h2 className="mt-1 text-lg font-extrabold text-gray-900">{items.length} product{items.length === 1 ? "" : "s"}</h2></div><div className="rounded-2xl bg-purple-50 p-3 text-[#852BAF]"><FiShoppingBag size={20} /></div></div>
          <div className="divide-y divide-gray-100 px-6">
            {items.map((item) => (
              <article key={item.order_item_id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-br from-gray-50 to-purple-50">
                  {item.image ? <img src={item.image} alt="" className="h-full w-full object-cover" /> : <FiPackage className="text-purple-300" size={23} />}
                </div>
                <div className="min-w-0 flex-1"><p className="font-extrabold text-gray-900">{item.product_name}</p><p className="mt-0.5 text-xs font-semibold text-gray-400">{item.brand_name}</p><div className="mt-2 flex flex-wrap gap-1.5">{Object.entries(item.attributes || {}).map(([key, value]) => <span key={key} className="rounded-lg border border-purple-100 bg-purple-50 px-2 py-1 text-[10px] font-bold text-purple-700">{key}: {value}</span>)}</div></div>
                <div className="grid grid-cols-3 gap-5 text-right sm:block sm:min-w-28"><div><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Qty</p><p className="font-bold text-gray-800">{item.quantity}</p></div><div className="sm:mt-2"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Price</p><p className="text-sm font-semibold text-gray-600">{money(item.price)}</p></div><div className="sm:mt-2"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Total</p><p className="font-extrabold text-[#852BAF]">{money(item.item_total)}</p></div></div>
              </article>
            ))}
          </div>
          <div className="m-5 rounded-2xl bg-gradient-to-r from-purple-50 to-pink-50 p-5"><div className="flex justify-between text-sm font-semibold text-gray-500"><span>Items subtotal</span><span>{money(summary.item_total)}</span></div><div className="my-3 h-px bg-purple-100" /><div className="flex items-end justify-between"><span className="font-extrabold text-gray-900">Your order total</span><span className="text-2xl font-extrabold text-[#852BAF]">{money(summary.vendor_total)}</span></div></div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-[0_10px_35px_rgba(52,22,68,0.07)]"><div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-purple-50 p-2.5 text-[#852BAF]"><FiUser /></div><h2 className="font-extrabold text-gray-900">Customer</h2></div><p className="font-extrabold text-gray-900">{customer.name}</p><a href={`mailto:${customer.email}`} className="mt-3 flex items-center gap-3 text-sm text-gray-500 hover:text-[#852BAF]"><FiMail className="shrink-0" />{customer.email}</a><a href={`tel:${customer.phone}`} className="mt-3 flex items-center gap-3 text-sm text-gray-500 hover:text-[#852BAF]"><FiPhone className="shrink-0" />{customer.phone}</a></section>
          <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-[0_10px_35px_rgba(52,22,68,0.07)]"><div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-pink-50 p-2.5 text-[#FC3F78]"><FiMapPin /></div><div><h2 className="font-extrabold text-gray-900">Shipping address</h2><p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{address.type || "Delivery"}</p></div></div><p className="font-bold text-gray-800">{address.name}</p><p className="mt-2 text-sm leading-6 text-gray-500">{addressLine}</p>{address.landmark && <p className="mt-2 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500">Near {address.landmark}</p>}<p className="mt-3 flex items-center gap-2 text-sm font-semibold text-gray-600"><FiPhone />{address.phone}</p></section>
          <section className="rounded-3xl border border-gray-100 bg-white p-6 shadow-[0_10px_35px_rgba(52,22,68,0.07)]"><div className="mb-4 flex items-center gap-3"><div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-600"><FiTruck /></div><h2 className="font-extrabold text-gray-900">Shipment</h2></div>{order.awb_number ? <><p className="text-xs font-bold uppercase tracking-widest text-gray-400">{order.courier_name || "Courier"}</p><p className="mt-2 rounded-xl bg-indigo-50 px-3 py-2.5 font-mono text-sm font-bold text-indigo-700">AWB {order.awb_number}</p></> : <p className="text-sm leading-6 text-gray-500">Tracking details will appear here once this order is shipped.</p>}</section>
        </aside>
      </div>
    </div>
  );
};

export default OrderDetail;
