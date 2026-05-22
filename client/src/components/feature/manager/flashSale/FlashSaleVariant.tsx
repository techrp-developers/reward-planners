import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import Swal from "sweetalert2";
import { api } from "../../../../api/api";
import "./css/flashsalevariant.css";

interface Variant {
  variant_id: number;
  product_name: string;
  sku: string;
  sale_price: number;
  flash_price: string | number; // string for controlled typing
  max_qty: string | number | null;
}

const FlashSaleVariant: React.FC = () => {
  const { flashId } = useParams();
  const [showModal, setShowModal] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [availableVariants, setAvailableVariants] = useState<any[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<number[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  useEffect(() => {
    if (showModal) fetchAvailableVariants();
  }, [showModal]);

  const fetchAvailableVariants = async () => {
    try {
      setLoadingAvailable(true);
      const res = await api.get(`/flash/flash-sale/${flashId}/available-variants`);
      setAvailableVariants(res.data.data || []);
    } catch (err) {
      console.error("Failed to fetch available variants", err);
    } finally {
      setLoadingAvailable(false);
    }
  };

  useEffect(() => {
    fetchVariants();
  }, []);

  const fetchVariants = async () => {
    const res = await api.get(`/flash/flash-sale/${flashId}/variants`);
    setVariants(
      (res.data.data || []).map((v: any) => ({
        ...v,
        flash_price: v.flash_price ?? "",
        max_qty: v.max_qty ?? "",
      }))
    );
  };

  const updateFlashVariant = async (
    id: number,
    price: number | null,
    maxQty: number | null,
    salePrice: number
  ) => {
    // Validation
    if (price !== null) {
      if (price > salePrice) {
        Swal.fire({
          icon: "error",
          title: "Price Exceeded",
          text: "Flash price cannot exceed sale price.",
          confirmButtonColor: "#852BAF",
        });
        return;
      }
      if (price < 0) {
        Swal.fire({
          icon: "error",
          title: "Invalid Price",
          text: "Flash price cannot be negative.",
          confirmButtonColor: "#852BAF",
        });
        return;
      }
    }

    if (maxQty !== null && maxQty <= 0) {
      Swal.fire({
        icon: "error",
        title: "Invalid Quantity",
        text: "Max quantity must be greater than 0.",
        confirmButtonColor: "#852BAF",
      });
      return;
    }

    try {
      await api.put(`/flash/flash-sale/${flashId}/variants/${id}`, {
        offer_price: price,
        max_qty: maxQty,
      });

      setVariants((prev) =>
        prev.map((v) =>
          v.variant_id === id
            ? {
                ...v,
                flash_price: price !== null ? price : v.flash_price,
                max_qty: maxQty !== null ? maxQty : v.max_qty,
              }
            : v
        )
      );

      Swal.fire({
        icon: "success",
        title: "Updated Successfully",
        timer: 1200,
        showConfirmButton: false,
        position: "top-end",
        toast: true,
      });
    } catch (err) {
      console.error("Failed to update flash variant", err);
      Swal.fire({
        icon: "error",
        title: "Update Failed",
        text: "Please try again",
        confirmButtonColor: "#852BAF",
      });
    }
  };

  const groupedVariants = availableVariants.reduce((acc: any, item: any) => {
    if (!acc[item.product_id]) {
      acc[item.product_id] = {
        product_name: item.product_name,
        variants: [],
      };
    }
    acc[item.product_id].variants.push(item);
    return acc;
  }, {});

  const toggleVariant = (id: number) => {
    setSelectedVariants((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]
    );
  };

  const handleAddVariants = async () => {
    if (!selectedVariants.length) return;
    try {
      await api.post(`/flash/flash-sale/${flashId}/variants`, {
        variant_ids: selectedVariants,
      });
      setShowModal(false);
      setSelectedVariants([]);
      fetchVariants();

      Swal.fire({
        icon: "success",
        title: "Variants Added",
        timer: 1200,
        showConfirmButton: false,
        position: "top-end",
        toast: true,
      });
    } catch (err) {
      console.error("Failed to add variants", err);
      Swal.fire({
        icon: "error",
        title: "Failed to Add Variants",
        text: "Please try again",
        confirmButtonColor: "#852BAF",
      });
    }
  };

  const handleRemoveVariant = async (variantId: number) => {
    try {
      await api.delete(`/flash/flash-sale/${flashId}/variants/${variantId}`);
      setVariants((prev) =>
        prev.filter((v) => v.variant_id !== variantId)
      );

      Swal.fire({
        icon: "success",
        title: "Variant Removed",
        timer: 1200,
        showConfirmButton: false,
        position: "top-end",
        toast: true,
      });
    } catch (err) {
      console.error("Failed to remove variant", err);
      Swal.fire({
        icon: "error",
        title: "Failed to Remove Variant",
        text: "Please try again",
        confirmButtonColor: "#852BAF",
      });
    }
  };

  return (
    <div className="fs-page">
      <div className="fs-card wide">
        {/* Header */}
        <div className="fs-header">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center
                bg-gradient-to-r from-[#852BAF] to-[#FC3F78]
                shadow-lg shadow-purple-300/40
                transition hover:shadow-xl">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z" />
              </svg>
            </div>
            <div>
              <h2>Flash Sale Variant Pricing</h2>
              <p>Set special flash prices for selected variants</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/manager/flashlist"
              className="inline-flex items-center gap-2 text-sm font-semibold
                 bg-[#852BAF] text-white px-4 py-2.5 rounded-md
                 shadow-md shadow-[#852BAF]/25
                 hover:bg-gradient-to-r hover:from-[#FC3F78] hover:to-[#852BAF]
                 hover:shadow-xl active:scale-95 transition"
            >
              <ArrowLeft size={16} /> Back
            </Link>

            <button
              className="bg-[#852BAF] text-white rounded-md px-4 py-2
                 hover:bg-gradient-to-r hover:from-[#FC3F78] hover:to-[#852BAF]
                 hover:shadow-xl active:scale-95
                 cursor-pointer"
              onClick={() => setShowModal(true)}
            >
              + Add Variant
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="fs-table-wrapper">
          <table className="fs-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Sale Price</th>
                <th>Flash Price</th>
                <th>Maximum Quantity</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {variants.length === 0 && (
                <tr>
                  <td colSpan={6} className="fs-empty">
                    No variants added to this flash sale yet.
                  </td>
                </tr>
              )}

              {variants.map((v) => (
                <tr key={v.variant_id}>
                  <td className="fs-product">{v.product_name}</td>
                  <td className="fs-variant">{v.sku}</td>
                  <td className="fs-sale-price">₹{v.sale_price}</td>

                  {/* Flash Price */}
                 <td>
  <div className="fs-price-input">
    ₹
    <input
      type="number"
      value={v.flash_price !== null ? v.flash_price : ""}
      onChange={(e) => {
        const value = e.target.value;
        const num = Number(value);

        // agar number exceed ho gaya, alert aur revert
        if (!isNaN(num) && num > v.sale_price) {
          Swal.fire({
            icon: "error",
            title: "Price Exceeded",
            text: "Flash price cannot exceed sale price.",
            confirmButtonColor: "#852BAF",
          });
          return; // previous value remain karegi
        }

        // valid number ya empty string update karo
        setVariants((prev) =>
          prev.map((item) =>
            item.variant_id === v.variant_id
              ? { ...item, flash_price: value }
              : item
          )
        );

        // valid number ke liye API call
        if (value !== "" && !isNaN(num)) {
          updateFlashVariant(v.variant_id, num, null, Number(v.sale_price));
        }
      }}
    />
  </div>
</td>


                  {/* Max Quantity */}
                 <td>
  <input
    type="number"
    placeholder="Max Qty"
    value={
      v.max_qty !== null
        ? Number(v.max_qty) < 0
          ? 0
          : v.max_qty
        : ""
    }
    onChange={(e) => {
      let value = e.target.value;
      let num = Number(value);

      // negative number prevent
      if (!isNaN(num) && num < 0) num = 0;

      setVariants((prev) =>
        prev.map((item) =>
          item.variant_id === v.variant_id
            ? { ...item, max_qty: value === "" ? "" : num }
            : item
        )
      );

      // valid number API call
      if (value !== "" && !isNaN(num)) {
        updateFlashVariant(v.variant_id, null, num, Number(v.sale_price));
      }
    }}
  />
</td>


                  {/* Remove */}
                  <td>
                    <button
                      className="fs-remove-btn"
                      onClick={() => handleRemoveVariant(v.variant_id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal */}
        {showModal && (
          <div className="fs-modal-overlay">
            <div className="fs-modal">
              <div className="fs-modal-header">
                <h3>Select Variants for Flash Sale</h3>
                <button onClick={() => setShowModal(false)}>✕</button>
              </div>
              <div className="fs-modal-body">
                {loadingAvailable ? (
                  <p>Loading variants...</p>
                ) : Object.keys(groupedVariants).length === 0 ? (
                  <p>No more variants available to add.</p>
                ) : (
                  Object.entries(groupedVariants).map(([productId, product]: any) => (
                    <div key={productId} className="fs-product-group">
                      <h4 className="fs-product-title">{product.product_name}</h4>
                      {product.variants.map((variant: any) => (
                        <label key={variant.variant_id} className="fs-variant-row">
                          <input
                            type="checkbox"
                            checked={selectedVariants.includes(variant.variant_id)}
                            onChange={() => toggleVariant(variant.variant_id)}
                          />
                          <span>{variant.sku} – ₹{variant.sale_price}</span>
                        </label>
                      ))}
                    </div>
                  ))
                )}
              </div>
              <div className="fs-modal-footer">
                <button className="fs-action-btn" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button
                  className="bg-[#852BAF] text-white rounded-md px-4 py-2
         hover:bg-gradient-to-r hover:from-[#FC3F78] hover:to-[#852BAF]
         hover:shadow-xl active:scale-95
         disabled:opacity-60 disabled:cursor-not-allowed
         cursor-pointer"
                  onClick={handleAddVariants}
                  disabled={!selectedVariants.length}
                >
                  Add Selected ({selectedVariants.length})
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FlashSaleVariant;
