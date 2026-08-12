import { useEffect, useState } from "react";
import Swal from "sweetalert2";
import {
  FaTag,
  FaBox,
  FaImages,
  FaFileUpload,
  FaSpinner,
  FaArrowLeft,
  FaDownload,
  FaCheck,
  FaTimes,
  FaRedo,
  FaTrash,
  FaTruck,
} from "react-icons/fa";

import { useNavigate, useParams } from "react-router-dom";
import QuillEditor from "../components/QuillEditor";

// const API_BASE = import.meta.env.VITE_API_URL;
import { api } from "../../../common/api/api";
import { routes } from "../../../routes";
// const API_BASEIMAGE_URL = "https://rewardplanners.com/api/crm";
const R2_BASE_URL = "https://cdn.rewardplanners.com";

type ActionType = "approve" | "reject" | "request_resubmission";

type ProductVariant = {
  variant_id: number;
  sku: string;
  mrp: number | null;
  sale_price: number | null;
  stock: number;
  weight: number | null;
  length: number | null;
  breadth: number | null;
  height: number | null;
  is_visible: number;
  variant_attributes: Record<string, string>;
  manufacturing_date: string | null;
  expiry_date: string | null;
  created_at: string;
  images?: string[];
};

interface ProductView {
  productId?: number | string;
  productName?: string;
  brandName?: string;
  manufacturer?: string;
  gstSlab: string;
  hsnSacCode: string;
  description?: string;
  shortDescription?: string;
  brandDescription?: string;
  categoryId?: number | null;
  subCategoryId?: number | null;
  subSubCategoryId?: number | null;
  categoryName?: string | null;
  subCategoryName?: string | null;
  subSubCategoryName?: string | null;
  product_status?: string;
  isDiscountEligible?: number;
  isReturnable?: number;
  isReplaceable?: number;
  returnWindowDays?: number | null;

  deliverySlaMinDays?: number;
  deliverySlaMaxDays?: number;
  shippingClass?: "standard" | "bulky" | "fragile";
  productImages?: string[];
  productVideo?: string | null;
  requiredDocs?: Array<{
    id: number;
    document_name: string;
    status: string;
    url?: string;
    mime_type: string;
    file_path: string;
  }>;

  variants: ProductVariant[];
}

interface DeliveryFeeEstimate {
  deliveryFee: number;
  destinationPincode: string;
  originPincode: string;
  variantId: number;
  courierName: string | null;
}

const FormInput = ({
  id,
  label,
  type = "text",
  value,
  placeholder = "",
}: any) => (
  <div className="flex flex-col space-y-1.5">
    <label
      htmlFor={id}
      className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em]"
    >
      {label}
    </label>
    {type === "textarea" ? (
      <textarea
        id={id}
        rows={4}
        name={id}
        value={value ?? ""}
        placeholder={placeholder}
        readOnly
        className="p-3 text-sm font-medium text-gray-800 border border-gray-200 rounded-xl bg-gray-50/60 resize-none focus:outline-none"
      />
    ) : (
      <input
        type={type}
        id={id}
        name={id}
        value={value ?? ""}
        placeholder={placeholder}
        readOnly
        className="p-3 text-sm font-medium text-gray-800 border border-gray-200 rounded-xl bg-gray-50/60 focus:outline-none"
      />
    )}
  </div>
);

const SectionHeader = ({ icon: Icon, title, description }: any) => (
  <div
    className="flex items-center gap-3 mb-5 pb-4"
    style={{ borderBottom: "2px solid rgba(133,43,175,0.1)" }}
  >
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
      style={{
        background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
      }}
    >
      <Icon className="text-white" style={{ fontSize: 15 }} />
    </div>
    <div>
      <h2 className="text-base font-bold text-gray-900 leading-none">
        {title}
      </h2>
      <p className="text-xs text-gray-400 mt-1">{description}</p>
    </div>
  </div>
);

function ImageLightbox({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute flex items-center justify-center w-10 h-10 text-white transition-colors rounded-full cursor-pointer top-5 right-5 bg-white/10 hover:bg-white/20"
      >
        <FaTimes />
      </button>

      <img
        src={src}
        alt="Full size preview"
        onClick={(e) => e.stopPropagation()}
        className="object-contain max-w-full max-h-full rounded-lg shadow-2xl"
      />
    </div>
  );
}

export default function ReviewProductPage() {
  // FIXED: use the correct param name from route
  const { id: productId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [product, setProduct] = useState<ProductView | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [productAttributes, setProductAttributes] = useState<
    Record<string, string[]>
  >({});
  const [attributeSchema, setAttributeSchema] = useState<any[]>([]);
  const [deliveryEstimate, setDeliveryEstimate] =
    useState<DeliveryFeeEstimate | null>(null);
  const [deliveryEstimateLoading, setDeliveryEstimateLoading] = useState(false);

  useEffect(() => {
    if (!productId) {
      setError("Product ID not provided in route.");
      setLoading(false);
      return;
    }
    void fetchProduct(productId);
    void fetchDeliveryEstimate(productId);
  }, [productId]);

  const fetchDeliveryEstimate = async (id: string) => {
    setDeliveryEstimateLoading(true);
    setDeliveryEstimate(null);

    try {
      const response = await api.get(
        `/product/${encodeURIComponent(id)}/delivery-fee-estimate`,
      );
      setDeliveryEstimate(response.data?.estimate ?? null);
    } catch (estimateError) {
      // The product review should remain usable when a courier is unavailable.
      console.error("Unable to calculate delivery fee estimate", estimateError);
    } finally {
      setDeliveryEstimateLoading(false);
    }
  };

  const resolveImageUrl = (path?: string) => {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://")) {
      return path;
    }
    return `${R2_BASE_URL}/${path.replace(/^\/+/, "")}`;
  };

  const fetchProduct = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get(`/product/${encodeURIComponent(id)}`);
      const json = res.data;

      const raw = json.data ?? json.product ?? json;

      const mapped: ProductView = {
        productId: raw.product_id ?? raw.productId,
        productName: raw.product_name ?? raw.productName,
        brandName: raw.brand_name ?? raw.brandName,
        manufacturer: raw.manufacturer ?? "",
        gstSlab: raw.gst_slab ?? "",
        hsnSacCode: raw.hsn_sac_code ?? "",
        description: raw.description ?? "",
        shortDescription: raw.short_description ?? raw.shortDescription ?? "",
        brandDescription: raw.brand_description ?? raw.brandDescription ?? "",
        categoryId: raw.category_id ?? raw.categoryId ?? null,
        subCategoryId: raw.subcategory_id ?? raw.subCategoryId ?? null,
        subSubCategoryId:
          raw.sub_subcategory_id ?? raw.subSubCategoryId ?? null,

        categoryName: raw.category_name ?? raw.custom_category ?? null,
        subCategoryName: raw.subcategory_name ?? raw.custom_subcategory ?? null,
        subSubCategoryName:
          raw.sub_subcategory_name ?? raw.custom_sub_subcategory ?? null,

        product_status: raw.status ?? "",
        isDiscountEligible: raw.is_discount_eligible ?? 1,
        isReturnable: raw.is_returnable ?? 1,
        isReplaceable: raw.is_replaceable ?? 1,
        returnWindowDays: raw.return_window_days ?? null,

        deliverySlaMinDays: raw.delivery_sla_min_days ?? 1,
        deliverySlaMaxDays: raw.delivery_sla_max_days ?? 3,
        shippingClass: raw.shipping_class ?? "standard",
        productImages: Array.isArray(raw.productImages)
          ? raw.productImages
          : (raw.images ?? []),
        productVideo: raw.video ?? null,
        requiredDocs: raw.documents ?? [],
        variants: Array.isArray(raw.variants) ? raw.variants : [],
      };

      if (raw.attributes) {
        let parsedAttributes: any = raw.attributes;

        try {
          // Step 1: parse outer layer if string
          if (typeof parsedAttributes === "string") {
            parsedAttributes = JSON.parse(parsedAttributes);
          }

          // Step 2: if it still has nested "attributes", parse again
          if (
            parsedAttributes.attributes &&
            typeof parsedAttributes.attributes === "string"
          ) {
            parsedAttributes = JSON.parse(parsedAttributes.attributes);
          }
        } catch (e) {
          console.error("Attribute JSON parse failed", e);
          parsedAttributes = {};
        }

        setProductAttributes(parsedAttributes);
      }

      setProduct(mapped);

      if (mapped.subCategoryId) {
        const params = new URLSearchParams({
          categoryId: String(mapped.categoryId),
          subcategoryId: String(mapped.subCategoryId),
        });

        api.get(`/category/attributes?${params.toString()}`).then((res) => {
          if (res.data.success) {
            setAttributeSchema(res.data.data);
          }
        });
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message ?? "Failed to load product");
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = (fileUrl: string, filename?: string) => {
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = filename || fileUrl.split("/").pop() || "file";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const okBtnClass =
    "px-6 py-2 rounded-xl font-bold text-white bg-[#852BAF] transition-all duration-300 cursor-pointer " +
    "hover:bg-gradient-to-r hover:from-[#852BAF] hover:to-[#FC3F78] active:scale-95";

  const handleProductAction = async (action: ActionType) => {
    if (!product) return;

    const modalConfigs: Record<
      ActionType,
      {
        title: string;
        text: string;
        icon: "warning" | "question" | "success" | "error" | "info";
        confirmText: string;
        confirmColor: string;
        needsReason: boolean;
        placeholder?: string;
      }
    > = {
      approve: {
        title: "Approve Product?",
        text: `Do you want to approve "${product.productName}"?`,
        icon: "success",
        confirmText: "Approve",
        confirmColor: "#16A34A",
        needsReason: false,
      },
      reject: {
        title: "Reject Product?",
        text: `Do you want to reject "${product.productName}"?`,
        icon: "error",
        confirmText: "Reject",
        confirmColor: "#DC2626",
        needsReason: true,
        placeholder: "Provide rejection reason...",
      },
      request_resubmission: {
        title: "Allow Resubmission?",
        text: `Allow vendor to resubmit "${product.productName}"?`,
        icon: "info",
        confirmText: "Allow",
        confirmColor: "#2563EB",
        needsReason: true,
        placeholder: "Reason for resubmission...",
      },
    };

    const cfg = modalConfigs[action];

    const result = await Swal.fire({
      title: cfg.title,
      text: cfg.text,
      icon: cfg.icon,
      showCancelButton: true,
      confirmButtonText: cfg.confirmText,
      cancelButtonText: "Cancel",
      confirmButtonColor: cfg.confirmColor,
      cancelButtonColor: "#9CA3AF",
      reverseButtons: true,
      input: cfg.needsReason ? "textarea" : undefined,
      inputPlaceholder: cfg.needsReason ? cfg.placeholder : undefined,
      inputAttributes: cfg.needsReason ? { "aria-label": "Reason" } : undefined,
      preConfirm: (value) => {
        if (cfg.needsReason && (!value || !String(value).trim())) {
          Swal.showValidationMessage("Reason is required.");
          return false;
        }
        return value;
      },
      buttonsStyling: false,
      customClass: {
        actions: "gap-[7px]",
        confirmButton:
          action === "approve"
            ? "px-6 py-2 rounded-xl font-bold text-white bg-green-600 hover:bg-green-700 transition-all duration-300 cursor-pointer active:scale-95"
            : action === "request_resubmission"
              ? "px-6 py-2 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all duration-300 cursor-pointer active:scale-95"
              : "px-6 py-2 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition-all duration-300 cursor-pointer active:scale-95",
        cancelButton:
          "px-6 py-2 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all duration-300 cursor-pointer",
        popup: "rounded-2xl",
      },
    });

    if (!result.isConfirmed) return;

    const reason = cfg.needsReason
      ? String(result.value || "").trim()
      : undefined;

    try {
      const endpoint =
        action === "request_resubmission" ? "resubmission" : action;

      const res = await api.put(
        `/manager/product/${endpoint}/${product.productId}`,
        reason ? { reason } : {},
      );

      if (!res.data.success)
        throw new Error(res.data.message || "Action failed");

      await Swal.fire({
        title: "Success!",
        text: res.data.message || "Action completed successfully.",
        icon: "success",
        timer: 1400,
        showConfirmButton: false,
        customClass: { popup: "rounded-2xl" },
      });

      navigate(routes.manager.products);
    } catch (error: any) {
      await Swal.fire({
        title: "Failed",
        text: error?.message || "Something went wrong.",
        icon: "error",
        confirmButtonText: "OK",
        buttonsStyling: false,
        customClass: {
          confirmButton: okBtnClass,
          popup: "rounded-2xl",
        },
      });
    }
  };

  const handleDelete = async () => {
    if (!product) return;

    const result = await Swal.fire({
      title: "Delete Product?",
      text: `Are you sure you want to delete "${product.productName}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
      confirmButtonColor: "#DC2626",
      cancelButtonText: "Cancel",
      reverseButtons: true,
    });

    if (!result.isConfirmed) return;

    try {
      const res = await api.delete(
        `/product/remove-product/${product.productId}`,
      );

      if (!res.data.success) {
        throw new Error(res.data.message || "Delete failed");
      }

      await Swal.fire({
        title: "Deleted!",
        text: "Product deleted successfully.",
        icon: "success",
        timer: 1200,
        showConfirmButton: false,
      });

      navigate(routes.manager.products);
    } catch (error: any) {
      await Swal.fire({
        title: "Error",
        text: error?.message || "Failed to delete product.",
        icon: "error",
      });
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <FaSpinner className="animate-spin text-4xl text-[#852BAF]" />
        <span className="ml-4 text-gray-600">Loading product...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="p-4 text-red-700 border rounded bg-red-50">{error}</div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-6">
        <div className="p-4 text-yellow-700 border rounded bg-yellow-50">
          No product found.
        </div>
      </div>
    );
  }

  const coverImage = product.productImages?.[0];

  const sc =
    "bg-white border border-gray-100 rounded-2xl p-6 shadow-sm mb-5 vendor-section-card";
  const fieldLabel =
    "text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] block mb-1.5";
  const fieldInput =
    "w-full p-3 text-sm font-medium text-gray-800 border border-gray-200 rounded-xl bg-gray-50/60 focus:outline-none";

  return (
    <div
      className="min-h-screen p-6"
      style={{
        background:
          "linear-gradient(160deg, #fdf8ff 0%, #fff5f8 50%, #f8f9ff 100%)",
      }}
    >
      <div className="mx-auto max-w-7xl">
        {/* PAGE HEADER */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-md"
              style={{
                background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
              }}
            >
              <FaBox className="text-white text-xl" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Product Review
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-500">
                  Product ID:{" "}
                  <span className="font-bold text-[#852BAF]">
                    #{product.productId}
                  </span>
                </span>
                <span className="hidden h-4 w-px bg-gray-300 sm:block" />
                <span
                  className="inline-flex min-h-8 items-center gap-2 rounded-full border border-purple-100 bg-white/90 px-3 py-1 font-semibold text-gray-700 shadow-sm"
                  title="Estimate for one unit of the first visible variant"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-50 text-[#852BAF]">
                    {deliveryEstimateLoading ? (
                      <FaSpinner className="animate-spin text-[10px]" />
                    ) : (
                      <FaTruck className="text-[10px]" />
                    )}
                  </span>
                  {deliveryEstimateLoading ? (
                    "Estimating delivery fee..."
                  ) : deliveryEstimate ? (
                    <>
                      Estimated delivery fee:{" "}
                      <span className="text-[#852BAF]">
                        {new Intl.NumberFormat("en-IN", {
                          style: "currency",
                          currency: "INR",
                          maximumFractionDigits: 2,
                        }).format(deliveryEstimate.deliveryFee)}
                      </span>
                      <span className="font-normal text-gray-400">
                        to {deliveryEstimate.destinationPincode}
                      </span>
                    </>
                  ) : (
                    <span className="font-medium text-gray-400">
                      Delivery estimate unavailable
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl shadow-md transition-all bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:opacity-90 active:scale-95 cursor-pointer"
          >
            <FaArrowLeft /> Back
          </button>
        </div>

        {/* Section: Category Selection */}
        <div className={sc}>
          <SectionHeader
            icon={FaTag}
            title="Category Selection"
            description="Category, sub-category and type"
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div>
              <label className={fieldLabel}>Category</label>
              <input
                readOnly
                value={String(product.categoryName ?? "Not selected")}
                className={fieldInput}
              />
            </div>
            <div>
              <label className={fieldLabel}>Sub Category</label>
              <input
                readOnly
                value={String(product.subCategoryName ?? "Not selected")}
                className={fieldInput}
              />
            </div>
            <div>
              <label className={fieldLabel}>Type / Sub-type</label>
              <input
                readOnly
                value={String(product.subSubCategoryName ?? "Not selected")}
                className={fieldInput}
              />
            </div>
          </div>
        </div>

        {/* Section: Product Identification */}
        <div className={sc}>
          <SectionHeader
            icon={FaTag}
            title="Product Identification"
            description="Basic product information"
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <FormInput
              id="productName"
              label="Product Name"
              value={product.productName}
            />
            <FormInput
              id="brandName"
              label="Brand Name"
              value={product.brandName}
            />
            <FormInput
              id="manufacturer"
              label="Manufacturer"
              value={product.manufacturer}
            />
            <FormInput
              id="gstSlab"
              label="GST Slab (%)"
              value={product.gstSlab}
            />
            <FormInput
              id="hsnSacCode"
              label="HSN / SAC Code"
              value={product.hsnSacCode}
            />
          </div>
        </div>

        {/* Product Attributes */}
        {attributeSchema.length > 0 && (
          <div className={sc}>
            <SectionHeader
              icon={FaBox}
              title="Product Attributes"
              description="Applies to all variants"
            />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {attributeSchema.map((attr) => {
                const values = productAttributes[attr.attribute_key] || [];
                return (
                  <div
                    key={attr.attribute_key}
                    className="p-4 border border-purple-100 bg-purple-50/40 rounded-xl"
                  >
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1">
                      {attr.attribute_label}
                    </p>
                    <p className="text-sm font-semibold text-gray-800">
                      {values.length > 0 ? values.join(", ") : "—"}
                    </p>
                  </div>
                );
              })}
              {Object.keys(productAttributes)
                .filter(
                  (key) =>
                    !attributeSchema.some((a) => a.attribute_key === key),
                )
                .map((key) => (
                  <div
                    key={key}
                    className="p-4 border border-yellow-100 bg-yellow-50/60 rounded-xl"
                  >
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] mb-1">
                      {key.replace(/_/g, " ")} (Legacy)
                    </p>
                    <p className="text-sm font-semibold text-gray-800">
                      {productAttributes[key].join(", ")}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Product Variants */}
        {product.variants?.length > 0 && (
          <div className={sc}>
            <SectionHeader
              icon={FaBox}
              title="Product Variants"
              description="SKU-wise pricing, attributes and stock details"
            />
            <div className="w-full overflow-x-auto overscroll-x-contain rounded-xl border border-gray-100">
              <table className="min-w-max text-sm text-left">
                <thead
                  style={{
                    background:
                      "linear-gradient(135deg, #fdf8ff 0%, #fff5f8 100%)",
                  }}
                >
                  <tr>
                    {[
                      "Images",
                      "SKU",
                      "Attributes",
                      "Weight",
                      "Dimensions (L x B x H)",
                      "Billable Weight",
                      "MRP",
                      "Sale Price",
                      "Stock",
                      "Visibility",
                      "Manufacturing Date",
                      "Expiry Date",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-[10px] font-black text-gray-500 uppercase tracking-wider whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {product.variants.map((variant) => (
                    <tr
                      key={variant.variant_id}
                      className="hover:bg-purple-50/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        {variant.images && variant.images.length > 0 ? (
                          <div className="flex flex-nowrap gap-1.5 whitespace-nowrap">
                            {variant.images.map((img, imgIndex) => (
                              <div
                                key={imgIndex}
                                onClick={() =>
                                  setLightboxImage(resolveImageUrl(img))
                                }
                                className="w-12 h-12 overflow-hidden border border-gray-200 rounded-lg cursor-pointer shrink-0"
                              >
                                <img
                                  src={resolveImageUrl(img)}
                                  alt={`${variant.sku} ${imgIndex + 1}`}
                                  className="object-cover w-full h-full transition-transform hover:scale-110"
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3 font-bold text-gray-800 text-xs">
                        {variant.sku}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {variant.variant_attributes &&
                            Object.entries(variant.variant_attributes).map(
                              ([key, value]) => (
                                <span
                                  key={key}
                                  className="px-2.5 py-0.5 text-[10px] font-bold text-[#852BAF] border border-purple-200 rounded-full bg-purple-50 uppercase"
                                >
                                  {key}: {value}
                                </span>
                              ),
                            )}
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {Number(variant.weight) > 0 ? `${Number(variant.weight).toFixed(3)} kg` : "-"}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {Number(variant.length) > 0 && Number(variant.breadth) > 0 && Number(variant.height) > 0
                          ? `${Number(variant.length)} x ${Number(variant.breadth)} x ${Number(variant.height)} cm`
                          : "-"}
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap font-bold text-[#852BAF]">
                        {Number(variant.weight) > 0 && Number(variant.length) > 0 && Number(variant.breadth) > 0 && Number(variant.height) > 0
                          ? `${Math.max(Number(variant.weight), (Number(variant.length) * Number(variant.breadth) * Number(variant.height)) / 5000).toFixed(3)} kg`
                          : "-"}
                      </td>

                      <td className="px-4 py-3 text-gray-700">
                        {variant.mrp ? `₹${variant.mrp}` : "—"}
                      </td>

                      <td className="px-4 py-3 font-semibold text-gray-800">
                        {variant.sale_price ? `₹${variant.sale_price}` : "—"}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${variant.stock === 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}
                        >
                          {variant.stock}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${variant.is_visible ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                        >
                          {variant.is_visible ? "Visible" : "Hidden"}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {variant.manufacturing_date
                          ? new Date(
                              variant.manufacturing_date,
                            ).toLocaleDateString("en-IN")
                          : "—"}
                      </td>

                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {variant.expiry_date
                          ? new Date(variant.expiry_date).toLocaleDateString(
                              "en-IN",
                            )
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Product Description */}
        <div className={sc}>
          <SectionHeader
            icon={FaBox}
            title="Product Description"
            description="Detailed and short description"
          />
          <div className="space-y-5">
            <div>
              <label className={fieldLabel}>Detailed Description</label>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <QuillEditor
                  value={product.description || ""}
                  readOnly
                  minHeight={260}
                />
              </div>
            </div>
            <div>
              <label className={fieldLabel}>Brand Description</label>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <QuillEditor
                  value={product.brandDescription || ""}
                  readOnly
                  minHeight={220}
                />
              </div>
            </div>
            <FormInput
              id="shortDescription"
              label="Short Description"
              value={product.shortDescription}
            />
          </div>
        </div>

        {/* Pricing & Commercial Controls */}
        <div className={sc}>
          <SectionHeader
            icon={FaTag}
            title="Pricing & Commercial Controls"
            description="Discount eligibility and return policy"
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <FormInput
              id="isDiscountEligible"
              label="Discount Eligible"
              value={product.isDiscountEligible === 1 ? "Yes" : "No"}
            />

            <FormInput
              id="isReplaceable"
              label="Replaceable"
              value={product.isReplaceable === 1 ? "Yes" : "No"}
              readOnly
            />

            <FormInput
              label="Return Policy"
              id="returnWindowDays"
              value={
                product.isReturnable === 1
                  ? `Returnable (${product.returnWindowDays ?? "-"} days)`
                  : "Not Returnable"
              }
            />
          </div>
        </div>

        {/* Logistics & Fulfilment */}
        <div className={sc}>
          <SectionHeader
            icon={FaBox}
            title="Logistics & Fulfilment"
            description="Delivery timeline and shipping classification"
          />
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <FormInput
              id="delivery_sla"
              label="Delivery SLA"
              value={`${product.deliverySlaMinDays} – ${product.deliverySlaMaxDays} days`}
            />
            <FormInput
              id="shippingClass"
              label="Shipping Class"
              value={
                product.shippingClass
                  ? product.shippingClass.charAt(0).toUpperCase() +
                    product.shippingClass.slice(1)
                  : "-"
              }
            />
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Delivery timeline shown to customers as an estimate. Actual delivery
            may vary by location.
          </p>
        </div>

        {/* Cover Image */}
        <div className={sc}>
          <SectionHeader
            icon={FaImages}
            title="Cover Image"
            description="Single cover image for product listing"
          />
          {coverImage ? (
            <div
              onClick={() => setLightboxImage(resolveImageUrl(coverImage))}
              className="relative w-36 h-36 overflow-hidden border border-gray-200 rounded-2xl group shadow-sm cursor-pointer"
            >
              <img
                src={resolveImageUrl(coverImage)}
                alt="Cover Image"
                className="object-cover w-full h-full transition-transform group-hover:scale-105"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  downloadFile(resolveImageUrl(coverImage), "cover-image.jpg");
                }}
                title="Download"
                className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 text-white transition-opacity bg-black/50 rounded-full opacity-0 group-hover:opacity-100 cursor-pointer"
              >
                <FaDownload className="text-xs" />
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No cover image available</p>
          )}
        </div>

        {/* Product Video */}
        <div className={sc}>
          <SectionHeader
            icon={FaImages}
            title="Product Video"
            description="Vendor uploaded demo video"
          />
          {product.productVideo ? (
            <div className="overflow-hidden border border-gray-200 rounded-2xl w-80 shadow-sm">
              <video
                src={resolveImageUrl(product.productVideo)}
                controls
                className="w-full"
              />
            </div>
          ) : (
            <p className="text-sm text-gray-400">No product video available</p>
          )}
        </div>

        {/* Documents */}
        {product.requiredDocs && product.requiredDocs.length > 0 && (
          <div className={sc}>
            <SectionHeader
              icon={FaFileUpload}
              title="Documents"
              description="Uploaded / required documents"
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {product.requiredDocs.map((doc) => {
                const fileUrl = resolveImageUrl(doc.file_path);
                return (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-4 p-4 bg-gray-50/60 border border-gray-100 rounded-2xl hover:border-purple-200 transition-all"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-800 truncate">
                        {doc.document_name}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {doc.mime_type || "Unknown type"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {doc.mime_type?.startsWith("image/") && (
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={fileUrl}
                            alt={doc.document_name}
                            className="w-14 h-14 object-cover rounded-xl border border-gray-200 hover:opacity-85 transition-opacity cursor-pointer"
                          />
                        </a>
                      )}
                      <button
                        onClick={() => downloadFile(fileUrl, doc.document_name)}
                        className="w-9 h-9 flex items-center justify-center text-white rounded-xl bg-gradient-to-br from-[#852BAF] to-[#FC3F78] hover:opacity-90 shadow-sm cursor-pointer transition-all"
                      >
                        <FaDownload className="text-sm" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className={sc}>
          <SectionHeader
            icon={FaCheck}
            title="Actions"
            description="Approve, reject or manage this product"
          />
          <div className="flex flex-wrap items-center gap-3">
            {(product.product_status === "pending" ||
              product.product_status === "sent_for_approval") && (
              <>
                <button
                  onClick={() => handleProductAction("approve")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl shadow-sm transition-all bg-green-600 hover:bg-green-700 active:scale-95 cursor-pointer"
                >
                  <FaCheck className="text-xs" /> Approve
                </button>

                <button
                  onClick={() => handleProductAction("reject")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl shadow-sm transition-all bg-red-500 hover:bg-red-600 active:scale-95 cursor-pointer"
                >
                  <FaTimes className="text-xs" /> Reject
                </button>
              </>
            )}

            <button
              onClick={() => handleProductAction("request_resubmission")}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl shadow-sm transition-all bg-[#852BAF] hover:opacity-90 active:scale-95 cursor-pointer"
            >
              <FaRedo className="text-xs" /> Request Resubmission
            </button>

            <button
              onClick={handleDelete}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-xl shadow-sm transition-all bg-red-500 hover:bg-red-600 active:scale-95 cursor-pointer"
            >
              <FaTrash className="text-xs" /> Delete
            </button>
          </div>
        </div>
      </div>

      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </div>
  );
}
