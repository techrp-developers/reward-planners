import { useEffect, useState } from "react";
import {
  FaTag,
  FaBox,
  FaImages,
  FaFileUpload,
  FaSpinner,
  FaArrowLeft,
  FaDownload,
  FaCheck,
} from "react-icons/fa";

import { useNavigate, useParams } from "react-router-dom";
import QuillEditor from "../../../QuillEditor";
import Swal from "sweetalert2";

// const API_BASE = import.meta.env.VITE_API_URL;
import { api } from "../../../../api/api";
// const API_BASEIMAGE_URL = "https://rewardplanners.com/api/crm";
const R2_BASE_URL = "https://cdn.rewardplanners.com";

type ProductVariant = {
  variant_id: number;
  sku: string;
  mrp: number | null;
  sale_price: number | null;
  stock: number;
  is_visible: number;
  variant_attributes: Record<string, string>;
  manufacturing_date: string | null;
  expiry_date: string | null;
  created_at: string;
  reward_redemption_limit?: number | null;
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

export default function ReviewProductPage() {
  // FIXED: use the correct param name from route
  const { id: productId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [product, setProduct] = useState<ProductView | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [productAttributes, setProductAttributes] = useState<
    Record<string, string[]>
  >({});
  const [attributeSchema, setAttributeSchema] = useState<any[]>([]);
  const [rewardLimits, setRewardLimits] = useState<Record<number, number>>({});
  const [savingLimit, setSavingLimit] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!productId) {
      setError("Product ID not provided in route.");
      setLoading(false);
      return;
    }
    fetchProduct(productId);
  }, [productId]);

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

      // reward Limit
      const initialLimits: Record<number, number> = {};

      (mapped.variants || []).forEach((v: any) => {
        initialLimits[v.variant_id] = v.reward_redemption_limit ?? 0;
      });

      setRewardLimits(initialLimits);

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

  const updateRewardLimit = async (variantId: number) => {
    try {
      if (!product?.productId) return;

      setSavingLimit((prev) => ({ ...prev, [variantId]: true }));

      const newLimit = rewardLimits[variantId];

      await api.post("/variant/update-reward-limit", {
        product_id: product.productId,
        variant_id: variantId,
        reward_redemption_limit: newLimit,
      });

      // ✅ sync UI with saved value
      setRewardLimits((prev) => ({
        ...prev,
        [variantId]: newLimit,
      }));

      await Swal.fire({
        title: "Success!",
        text: "Reward Limit Updated Successfully",
        icon: "success",
        timer: 1200,
        showConfirmButton: false,
        customClass: { popup: "rounded-2xl" },
      });
    } catch (err) {
      console.error("Failed to update reward limit", err);

      await Swal.fire({
        title: "Failed",
        text: "Failed to update reward limit",
        icon: "error",
        confirmButtonText: "OK",
        buttonsStyling: false,
      });
    } finally {
      setSavingLimit((prev) => ({ ...prev, [variantId]: false }));
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
              <p className="mt-1 text-sm text-gray-400">
                Product ID:{" "}
                <span className="font-bold text-[#852BAF]">
                  #{product.productId}
                </span>
              </p>
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
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="min-w-full text-sm text-left">
                <thead
                  style={{
                    background:
                      "linear-gradient(135deg, #fdf8ff 0%, #fff5f8 100%)",
                  }}
                >
                  <tr>
                    {[
                      "SKU",
                      "Attributes",
                      "MRP",
                      "Sale Price",
                      "Stock",
                      "Visibility",
                      "Reward Limit (%)",
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

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            value={rewardLimits[variant.variant_id] ?? 0}
                            onChange={(e) =>
                              setRewardLimits((prev) => ({
                                ...prev,
                                [variant.variant_id]: Number(e.target.value),
                              }))
                            }
                            className="w-20 p-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#852BAF]"
                            placeholder="Limit"
                          />
                          <button
                            onClick={() =>
                              updateRewardLimit(variant.variant_id)
                            }
                            disabled={savingLimit[variant.variant_id]}
                            className="w-8 h-8 flex items-center justify-center text-white bg-green-600 rounded-lg cursor-pointer hover:bg-green-700 disabled:opacity-50 transition-all"
                          >
                            {savingLimit[variant.variant_id] ? (
                              <FaSpinner className="text-xs animate-spin" />
                            ) : (
                              <FaCheck className="text-xs" />
                            )}
                          </button>
                        </div>
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
            <div className="relative w-36 h-36 overflow-hidden border border-gray-200 rounded-2xl group shadow-sm">
              <img
                src={resolveImageUrl(coverImage)}
                alt="Cover Image"
                className="object-cover w-full h-full"
              />
              <button
                onClick={() =>
                  downloadFile(resolveImageUrl(coverImage), "cover-image.jpg")
                }
                className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-2xl"
              >
                <FaDownload className="text-white text-lg" />
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
      </div>
    </div>
  );
}
