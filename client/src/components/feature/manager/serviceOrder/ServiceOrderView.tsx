import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../../../api/api";

interface Customer {
  name: string;
  email: string;
  mobile: string;
}

interface Address {
  address_type: string;
  address1: string;
  address2: string;
  city: string;
  zipcode: string;
  landmark: string;
  contact_name: string;
  contact_phone: string;
  state: string;
  country: string;
}

interface ServiceItem {
  id: number;
  order_ref: string;
  service_name: string;
  variant_name: string;
  title: string;
  image_url: string | null;
  price: number;
  status: string;
}

interface Bundle {
  bundle_id: number;
  bundle_total: number;
  items: ServiceItem[];
}

interface ServiceOrderDetails {
  parent_order_id: string;
  status: string;
  created_at: string;
  customer: Customer;
  address: Address | null;
  items: ServiceItem[];
  bundles: Bundle[];
  total_amount: number;
}

interface ApiResponse {
  success: boolean;
  data: ServiceOrderDetails;
}

const ServiceOrderView: React.FC = () => {
  const { parentOrderId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState<ServiceOrderDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await api.get<ApiResponse>(
        `/v1/service-orders/admin-order-details/${parentOrderId}`
      );

      if (!res.data.success) {
        throw new Error("Failed to fetch order");
      }

      setData(res.data.data);
    } catch (err) {
      console.error(err);
      setError("Unable to load service order.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (parentOrderId) {
      fetchOrder();
    }
  }, [parentOrderId]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending_payment:
        "bg-yellow-100 text-yellow-800 border-yellow-200",

      documents_pending:
        "bg-orange-100 text-orange-800 border-orange-200",

      documents_uploaded:
        "bg-blue-100 text-blue-800 border-blue-200",

      in_progress:
        "bg-indigo-100 text-indigo-800 border-indigo-200",

      completed:
        "bg-green-100 text-green-800 border-green-200",

      cancelled:
        "bg-red-100 text-red-800 border-red-200",
    };

    const cls =
      map[status] ??
      "bg-gray-100 text-gray-700 border-gray-200";

    return `inline-flex items-center px-3 py-1 rounded-full border text-xs font-semibold uppercase ${cls}`;
  };

  if (loading) {
    return (
      <div className="p-6">
        Loading service order...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-red-500">
        {error}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div
      className="min-h-screen p-6 md:p-10"
      style={{
        background:
          "linear-gradient(160deg, #fdf8ff 0%, #fff5f8 50%, #f8f9ff 100%)",
      }}
    >
      {/* HEADER */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-semibold bg-gradient-to-r from-[#852BAF] to-[#FC3F78] shadow-lg hover:scale-[1.03] active:scale-95 transition cursor-pointer"
        >
          ← Back
        </button>

        <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
          Service Order
        </h2>
      </div>

      {/* ORDER SUMMARY */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-5">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
          Order Summary
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <span className="text-xs text-gray-400">
              Parent Order ID
            </span>

            <p className="mt-1 font-semibold text-gray-800 break-all">
              {data.parent_order_id}
            </p>
          </div>

          <div>
            <span className="text-xs text-gray-400">
              Status
            </span>

            <div className="mt-2">
              <span className={getStatusBadge(data.status)}>
                {data.status.replaceAll("_", " ")}
              </span>
            </div>
          </div>

          <div>
            <span className="text-xs text-gray-400">
              Created On
            </span>

            <p className="mt-1 font-semibold text-gray-800">
              {new Date(data.created_at).toLocaleDateString("en-IN")}
            </p>
          </div>

          <div>
            <span className="text-xs text-gray-400">
              Total Amount
            </span>

            <p className="mt-1 text-xl font-bold text-[#852BAF]">
              {formatCurrency(data.total_amount)}
            </p>
          </div>
        </div>
      </div>

      {/* CUSTOMER */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-5">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
          Customer Details
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <span className="text-xs text-gray-400">
              Name
            </span>

            <p className="mt-1 font-semibold text-gray-800">
              {data.customer.name}
            </p>
          </div>

          <div>
            <span className="text-xs text-gray-400">
              Email
            </span>

            <p className="mt-1 font-semibold text-gray-800">
              {data.customer.email}
            </p>
          </div>

          <div>
            <span className="text-xs text-gray-400">
              Mobile
            </span>

            <p className="mt-1 font-semibold text-gray-800">
              {data.customer.mobile}
            </p>
          </div>
        </div>
      </div>

      {/* ADDRESS */}
      {data.address && (
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-5">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
            Service Address
          </h3>

          <p className="font-semibold text-gray-800">
            {data.address.contact_name}
          </p>

          <p className="text-gray-600 text-sm">
            {data.address.contact_phone}
          </p>

          <p className="text-gray-600 text-sm mt-2">
            {data.address.address1}
            {data.address.address2
              ? `, ${data.address.address2}`
              : ""}
          </p>

          <p className="text-gray-600 text-sm">
            {data.address.city}, {data.address.state},{" "}
            {data.address.country} - {data.address.zipcode}
          </p>

          {data.address.landmark && (
            <p className="text-sm text-gray-400 mt-2">
              Landmark: {data.address.landmark}
            </p>
          )}
        </div>
      )}

      {/* SERVICE ITEMS */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-5">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-5">
          Service Items
        </h3>

        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead
              style={{
                background:
                  "linear-gradient(135deg, #fdf8ff 0%, #fff5f8 100%)",
              }}
            >
              <tr>
                {[
                  "Order Ref",
                  "Service",
                  "Variant",
                  "Price",
                  "Status",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-left text-gray-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {data.items.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-purple-50/30"
                >
                  <td className="px-4 py-3 font-semibold">
                    {item.order_ref}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {item.image_url && (
                        <img
                          src={item.image_url}
                          alt={item.service_name}
                          className="w-12 h-12 rounded-lg object-cover border"
                        />
                      )}

                      <div>
                        <p className="font-semibold text-gray-800">
                          {item.service_name}
                        </p>

                        <p className="text-xs text-gray-500">
                          {item.title}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {item.variant_name}
                  </td>

                  <td className="px-4 py-3 font-semibold">
                    {formatCurrency(item.price)}
                  </td>

                  <td className="px-4 py-3">
                    <span className={getStatusBadge(item.status)}>
                      {item.status.replaceAll("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* BUNDLES */}
      {data.bundles.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-5">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
            Bundles
          </h3>

          {data.bundles.map((bundle) => (
            <div
              key={bundle.bundle_id}
              className="border rounded-xl p-4 mb-4"
            >
              <div className="font-semibold text-[#852BAF] mb-3">
                Bundle #{bundle.bundle_id}
              </div>

              <div className="space-y-2">
                {bundle.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between text-sm"
                  >
                    <span>{item.service_name}</span>

                    <span>
                      {formatCurrency(item.price)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t text-right font-bold">
                Bundle Total:{" "}
                {formatCurrency(bundle.bundle_total)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TOTAL */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <div className="flex justify-between items-center">
          <span className="text-lg font-semibold text-gray-700">
            Grand Total
          </span>

          <span className="text-2xl font-bold text-[#852BAF]">
            {formatCurrency(data.total_amount)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ServiceOrderView;
