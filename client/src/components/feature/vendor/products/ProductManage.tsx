import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../../../../api/api";
import {
  FaEdit,
  FaImages,
  FaArrowLeft,
  FaSpinner,
  FaBoxOpen,
} from "react-icons/fa";
import { FiPackage } from "react-icons/fi";

import $ from "jquery";
import "datatables.net";
import "datatables.net-responsive";

/* ================= UI HELPERS (ONBOARDING THEME) ================= */

function SectionHeader({ icon: Icon, title, description }: any) {
  return (
    <div className="flex items-center space-x-4 pb-4 border-b border-gray-100 mb-6">
      <div className="p-4 text-white rounded-2xl" style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 6px 20px rgba(133,43,175,0.25)" }}>
        <Icon className="text-2xl" />
      </div>
      <div>
        <h3 className="text-xl font-bold text-gray-800">{title}</h3>
        {description && (
          <p className="text-sm text-gray-500 font-medium">{description}</p>
        )}
      </div>
    </div>
  );
}

interface Variant {
  variant_id: number;
  sku: string;
  mrp: number | null;
  sale_price: number | null;
  stock: number;
  variant_attributes: Record<string, string>;
  is_visible: boolean;
}

export default function ProductManage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();

  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);

  const tableRef = useRef<HTMLTableElement>(null);

  /* ================= FETCH VARIANTS ================= */
  useEffect(() => {
    if (!productId) return;

    api
      .get(`/variant/product/${productId}`)
      .then((res) => {
        if (res.data.success) {
          setVariants(res.data.data);
        }
      })
      .finally(() => setLoading(false));
  }, [productId]);

  /* ================= INIT DATATABLE ================= */
  useEffect(() => {
    if (!tableRef.current || variants.length === 0) return;

    const table = $(tableRef.current).DataTable({
      destroy: true,
      responsive: true,
      pageLength: 10,
      lengthMenu: [10, 25, 50],
      ordering: true,
      searching: true,
      language: {
        search: "Search variants",
        lengthMenu: "Show _MENU_",
        info: "Showing _START_ to _END_ of _TOTAL_ variants",
        emptyTable: "No variants available",
      },
      columnDefs: [{ orderable: false, targets: [1, 5] }],
    });

    return () => {
      table.destroy();
    };
  }, [variants]);

  const toggleVisibility = async (variantId: number, current: boolean) => {
    try {
      await api.patch(`/variant/visibility/${variantId}`, {
        is_visible: !current,
      });

      setVariants((prev) =>
        prev.map((v) =>
          v.variant_id === variantId ? { ...v, is_visible: !current } : v,
        ),
      );
    } catch (error) {
      console.error("Failed to update visibility", error);
      alert("Unable to update visibility");
    }
  };

  /* ================= LOADING ================= */
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <FaSpinner className="animate-spin text-3xl text-[#852BAF]" />
        <span className="ml-3 text-gray-600 text-lg">Loading variants…</span>
      </div>
    );
  }

  /* ================= UI ================= */
  return (
    <div className="max-w-7xl mx-auto">
      {/* PAGE HEADER */}
      <div
        className="flex items-center justify-between mb-6 p-5 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            Manage <span className="gradient-text-brand">Product Variants</span>
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            View and manage pricing, stock, and images
          </p>
        </div>

        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-gray-200 bg-white text-gray-700 hover:border-[#852BAF] hover:text-[#852BAF] transition-all duration-200 cursor-pointer"
        >
          <FaArrowLeft size={12} /> Back
        </button>
      </div>

      {/* VARIANT LIST */}
      <section className="space-y-4 bg-white rounded-2xl p-6 sm:p-8 vendor-section-card" style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}>
        <SectionHeader
          icon={FiPackage}
          title="Variants"
          description={`${variants.length} variants available for this product`}
        />

        <div className="overflow-x-auto">
          <table ref={tableRef} className="display responsive nowrap w-full">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Attributes</th>
                <th>MRP</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Visibility</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {variants.map((v) => (
                <tr key={v.variant_id}>
                  {/* SKU */}
                  <td className="font-semibold text-gray-900">{v.sku}</td>

                  {/* ATTRIBUTES */}
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(v.variant_attributes).map(
                        ([key, val]) => (
                          <span
                            key={key}
                            className="px-3 py-1 text-xs font-semibold rounded-full
                         bg-purple-50 text-purple-700
                         border border-purple-200"
                          >
                            {key.toUpperCase()}: {val}
                          </span>
                        ),
                      )}
                    </div>
                  </td>

                  {/* MRP */}
                  <td className="text-gray-600">{v.mrp ? `₹${v.mrp}` : "—"}</td>

                  {/* SALE PRICE */}
                  <td className="font-semibold text-gray-900">
                    {v.sale_price ? `₹${v.sale_price}` : "—"}
                  </td>

                  {/* STOCK */}
                  <td>
                    <span
                      className={`px-3 py-1 text-sm font-semibold rounded-full ${
                        v.stock > 0
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {v.stock}
                    </span>
                  </td>

                  {/* VISIBILITY */}
                  <td>
                    <button
                      onClick={() => toggleVisibility(v.variant_id, v.is_visible)}
                      className={`toggle-track cursor-pointer relative inline-flex h-6 w-11 items-center rounded-full ${v.is_visible ? "bg-emerald-500" : "bg-gray-200"}`}
                      title={v.is_visible ? "Visible" : "Hidden"}
                    >
                      <span className={`toggle-thumb inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ${v.is_visible ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </td>

                  {/* ACTIONS */}
                  <td>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() =>
                          navigate(
                            `/vendor/products/variant-edit/${v.variant_id}`,
                          )
                        }
                        className="
                          inline-flex items-center justify-center
                          w-9 h-9
                          rounded-full
                          bg-blue-50 text-blue-600
                          hover:bg-blue-100
                          transition
                          cursor-pointer
                        "
                        title="Edit Variant"
                      >
                        <FaEdit size={14} />
                      </button>

                      <button
                        onClick={() =>
                          navigate(
                            `/vendor/products/variant-image/${v.variant_id}`,
                          )
                        }
                        className="
                          inline-flex items-center justify-center
                          w-9 h-9
                          rounded-full
                          bg-purple-50 text-purple-600
                          hover:bg-purple-100
                          transition
                          cursor-pointer
                        "
                        title="Manage Images"
                      >
                        <FaImages size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {variants.length === 0 && (
            <div className="py-16 text-center">
              <FaBoxOpen className="mx-auto text-4xl text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900">
                No variants found
              </h3>
              <p className="text-gray-500">
                This product does not have any variants yet.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
