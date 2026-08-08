import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../../common/api/api";

const statusStyles: Record<string, { bg: string; text: string }> = {
  pending:   { bg: "bg-amber-100",   text: "text-amber-800" },
  paid:      { bg: "bg-blue-100",    text: "text-blue-800" },
  shipped:   { bg: "bg-indigo-100",  text: "text-indigo-700" },
  delivered: { bg: "bg-emerald-100", text: "text-emerald-700" },
  cancelled: { bg: "bg-red-100",     text: "text-red-700" },
};
const getStatusStyle = (s: string) =>
  statusStyles[s.toLowerCase()] ?? { bg: "bg-gray-100", text: "text-gray-700" };

interface Order {
  vendor_order_id: number;
  vendor_total: number;
  shipping_status: string;
  created_at: string;
  order_id: number;
  order_ref: string;
  awb_number?: string;
  courier_name?: string;
}

interface Customer {
  user_id: number;
  name: string;
  email: string;
  phone: string;
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
  landmark?: string;
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

interface Summary {
  item_total: number;
  vendor_total: number;
}

interface VendorOrderDetailsResponse {
  success: boolean;
  order: Order;
  customer: Customer;
  address: Address;
  items: OrderItem[];
  summary: Summary;
}

const OrderDetail: React.FC = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState<VendorOrderDetailsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.get<VendorOrderDetailsResponse>(
        `/order/order-view/${orderId}`
      );

      if (!res.data.success) {
        throw new Error("Failed to load order");
      }

      setData(res.data);

    } catch (err) {
      console.error("Failed to fetch vendor order details", err);
      setError("Unable to load order details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderId) fetchOrderDetails();
  }, [orderId]);

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

  if (loading) return <div style={{ padding: 20 }}>Loading order...</div>;
  if (error) return <div style={{ padding: 20, color: "red" }}>{error}</div>;
  if (!data) return null;

  const { order, customer, address, items, summary } = data;

  return (
    <div className="max-w-5xl mx-auto">

      {/* PAGE HEADER */}
      <div
        className="flex items-center justify-between mb-6 p-5 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div>
          <h2 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            Order <span className="gradient-text-brand">#{order.order_ref}</span>
          </h2>
          <p className="text-xs text-gray-500 font-medium mt-0.5">Order details and shipping information</p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl text-white cursor-pointer transition-all active:scale-95"
          style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 4px 14px rgba(133,43,175,0.28)" }}
          onClick={() => navigate(-1)}
        >
          ← Back
        </button>
      </div>

      {/* ORDER INFO */}
      <div className="bg-white rounded-2xl p-6 shadow-sm mb-4 vendor-section-card" style={{ border: "1px solid rgba(133,43,175,0.08)" }}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          <div>
            <span className="text-xs text-slate-500">Shipment Status</span>
            <p className={`mt-1 inline-block px-3 py-1.5 rounded-full text-xs font-semibold capitalize ${getStatusStyle(order.shipping_status).bg} ${getStatusStyle(order.shipping_status).text}`}>
              {order.shipping_status}
            </p>
          </div>

          <div>
            <span className="text-xs text-slate-500">Date</span>
            <p className="mt-1 font-medium">
              {formatDate(order.created_at)}
            </p>
          </div>

          <div>
            <span className="text-xs text-slate-500">Vendor Total</span>
            <p className="mt-1 text-lg font-bold text-[#2563eb]">
              {formatCurrency(order.vendor_total)}
            </p>
          </div>

        </div>

        {order.awb_number && (
          <div className="mt-4 text-sm text-slate-600">
            Courier: {order.courier_name} | AWB: {order.awb_number}
          </div>
        )}
      </div>

      {/* CUSTOMER */}
      <div className="bg-white rounded-2xl p-6 shadow-sm mb-4 vendor-section-card" style={{ border: "1px solid rgba(133,43,175,0.08)" }}>
        <h3 className="text-lg font-semibold mb-4">Customer Details</h3>

        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <span className="text-xs text-slate-500">Name</span>
            <p className="font-medium">{customer.name}</p>
          </div>

          <div>
            <span className="text-xs text-slate-500">Email</span>
            <p>{customer.email}</p>
          </div>

          <div>
            <span className="text-xs text-slate-500">Phone</span>
            <p>{customer.phone}</p>
          </div>
        </div>
      </div>

      {/* ADDRESS */}
      <div className="bg-white rounded-2xl p-6 shadow-sm mb-4 vendor-section-card" style={{ border: "1px solid rgba(133,43,175,0.08)" }}>
        <h3 className="text-lg font-semibold mb-3">Shipping Address</h3>

        <p className="font-medium">{address.name}</p>
        <p>{address.phone}</p>
        <p>{address.line1}, {address.line2}</p>

        <p>
          {address.city}, {address.state}, {address.country} - {address.zipcode}
        </p>

        {address.landmark && (
          <p className="text-sm text-slate-500 mt-2">
            Landmark: {address.landmark}
          </p>
        )}
      </div>

      {/* ITEMS */}
      <div className="bg-white rounded-2xl p-6 shadow-sm vendor-section-card" style={{ border: "1px solid rgba(133,43,175,0.08)" }}>

        <h3 className="text-lg font-semibold mb-4">Order Items</h3>

        <div className="overflow-x-auto border rounded-xl">
          <table className="w-full text-sm">

            <thead>
              <tr style={{ background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.03) 100%)" }}>
                {["Product", "Brand", "Attributes", "Qty", "Price", "Total"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {items.map((item, index) => (
                <tr key={item.order_item_id} className="row-animate hover:bg-purple-50/20 transition-colors" style={{ animationDelay: `${index * 35}ms` }}>
                  <td className="px-4 py-3 font-semibold text-gray-900">{item.product_name}</td>
                  <td className="px-4 py-3 text-gray-600">{item.brand_name}</td>
                  <td className="px-4 py-3">
                    {Object.entries(item.attributes).map(([k, v]) => (
                      <span key={k} className="inline-block mr-1 mb-1 px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 rounded-full text-xs font-medium">
                        {k}: {v}
                      </span>
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
        <div className="mt-6 border-t pt-4 space-y-2 text-sm">

          <div className="flex justify-between">
            <span>Items Total:</span>
            <span>{formatCurrency(summary.item_total)}</span>
          </div>

          <div className="flex justify-between text-lg font-bold">
            <span>Vendor Total:</span>
            <span className="text-[#2563eb]">
              {formatCurrency(summary.vendor_total)}
            </span>
          </div>

        </div>

      </div>
    </div>
  );
};

export default OrderDetail;