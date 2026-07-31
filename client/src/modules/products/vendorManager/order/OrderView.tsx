import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../../../common/api/api";

interface Order {
  order_id: number;
  order_ref: string;
  status: string;
  total_amount: number;
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
}

const OrderView: React.FC = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState<OrderDetailsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrderDetails = async () => {
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
  };

  useEffect(() => {
    if (orderId) {
      fetchOrderDetails();
    }
  }, [orderId]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);

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
    <div className="flex items-center justify-between mb-8">
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
    </div>

    {/* ORDER INFO */}
    <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-5">
      <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Order Summary</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
