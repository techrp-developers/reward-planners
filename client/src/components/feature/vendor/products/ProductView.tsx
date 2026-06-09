import { useState, useEffect } from "react";
import type { ChangeEvent } from "react";
import type { ComponentType } from "react";
import { useParams, useNavigate } from "react-router-dom";
import QuillEditor from "../../../QuillEditor";
type IconComp = ComponentType<any>;

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: IconComp;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-center pb-4 mb-4 space-x-3 border-b border-gray-200">
      <div
        className="p-3 text-white rounded-md"
        style={{ background: "linear-gradient(to right, #852BAF, #FC3F78)" }}
      >
        <Icon />
      </div>
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
      </div>
    </div>
  );
}

function FormInput(props: {
  id: string;
  label: string;
  value?: string | number;
  onChange?: (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void;
  type?: "text" | "textarea";
  required?: boolean;
  placeholder?: string;
  error?: string;
  readOnly?: boolean;
}) {
  const {
    id,
    label,
    value = "",
    onChange,
    type = "text",
    required,
    placeholder,
    error,
    readOnly = false,
  } = props;

  return (
    <div className="flex flex-col space-y-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>

      {type === "textarea" ? (
        <textarea
          id={id}
          name={id}
          value={String(value)}
          onChange={onChange}
          readOnly={readOnly}
          placeholder={placeholder}
          className="p-3 text-gray-800 border border-gray-200 rounded-lg shadow-sm cursor-default bg-gray-50"
        />
      ) : (
        <input
          id={id}
          name={id}
          value={String(value)}
          onChange={onChange}
          readOnly={readOnly}
          type="text"
          placeholder={placeholder}
          className="p-3 text-gray-800 border border-gray-200 rounded-lg shadow-sm cursor-default bg-gray-50"
        />
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

import {
  FaTag,
  FaBox,
  FaImages,
  FaFileUpload,
  FaSpinner,
  FaArrowLeft,
  FaEdit,
} from "react-icons/fa";
import { Link } from "react-router-dom";

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

export default function ReviewProductPage() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();

  const [product, setProduct] = useState<ProductView | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [productAttributes, setProductAttributes] = useState<
    Record<string, string[]>
  >({});
  const [attributeSchema, setAttributeSchema] = useState<any[]>([]);

  useEffect(() => {
    if (!productId) {
      setError("Product ID not provided in route.");
      setLoading(false);
      return;
    }
    fetchProduct(productId);
  }, [productId]);

  // const resolveImageUrl = (path?: string) => {
  //   if (!path) return "";

  //   if (path.startsWith("http://") || path.startsWith("https://")) {
  //     return path;
  //   }

  //   return `${API_BASEIMAGE_URL}/uploads/${path.replace(/^\/+/, "")}`;
  // };

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

      const raw = res.data?.data ?? res.data?.product ?? res.data;

      // Map backend shape to ProductView expected by this page
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
      setError(
        err?.response?.data?.message || err.message || "Failed to load product",
      );
    } finally {
      setLoading(false);
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

  return (
    <div>
      <div className="mx-auto max-w-7xl">
        {/* PAGE HEADER */}
        <div
          className="flex items-center justify-between p-5 mb-6 rounded-2xl"
          style={{
            background:
              "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
            border: "1px solid rgba(133,43,175,0.1)",
          }}
        >
          <div className="flex items-center gap-4">
            <div
              className="flex items-center justify-center w-11 h-11 rounded-2xl"
              style={{
                background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
                boxShadow: "0 6px 18px rgba(133,43,175,0.28)",
              }}
            >
              <FaBox className="text-lg text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">
                Product <span className="gradient-text-brand">Review</span>
              </h1>
              <p className="text-xs text-gray-500 font-medium mt-0.5">
                Product ID: #{product.productId}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-gray-200 bg-white text-gray-700 hover:border-[#852BAF] hover:text-[#852BAF] transition-all duration-200 cursor-pointer"
            >
              <FaArrowLeft size={12} /> Back
            </button>

            {!["approved", "rejected", "sent_for_approval"].includes(
              product.product_status ?? "",
            ) && (
              <Link
                to={`/vendor/products/edit/${product.productId}`}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl text-white cursor-pointer transition-all duration-200 hover:opacity-90 active:scale-95"
                style={{
                  background:
                    "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
                  boxShadow: "0 4px 14px rgba(133,43,175,0.28)",
                }}
              >
                <FaEdit size={12} /> Edit
              </Link>
            )}
          </div>
        </div>

        {/* CONTENT CARD */}
        <div style={{ borderColor: "rgba(133,43,175,0.08)" }}>
          {/* Category Selection (readonly / disabled) */}
          <section className="p-5 border border-gray-100 vendor-section-card bg-gray-50/50 rounded-2xl">
            <SectionHeader
              icon={FaTag}
              title="Category Selection"
              description="Category, sub-category and type"
            />

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  Category
                </label>
                <input
                  readOnly
                  value={String(product.categoryName ?? "Not selected")}
                  className="w-full p-3 border rounded-lg bg-gray-50"
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  Sub Category
                </label>
                <input
                  readOnly
                  value={String(product.subCategoryName ?? "Not selected")}
                  className="w-full p-3 border rounded-lg bg-gray-50"
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  Type / Sub-type
                </label>
                <input
                  readOnly
                  value={String(product.subSubCategoryName ?? "Not selected")}
                  className="w-full p-3 border rounded-lg bg-gray-50"
                />
              </div>
            </div>
          </section>

          {/* Product Identification */}
          <section className="p-5 mt-4 border border-gray-100 vendor-section-card bg-gray-50/50 rounded-2xl">
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
                readOnly
              />
              <FormInput
                id="brandName"
                label="Brand Name"
                value={product.brandName}
                readOnly
              />
              <FormInput
                id="manufacturer"
                label="Manufacturer"
                value={product.manufacturer}
                readOnly
              />

              <FormInput
                id="gstSlab"
                label="GST Slab (%) "
                value={product.gstSlab}
                readOnly
              />

              <FormInput
                id="hsnSacCode"
                label="HSN / SAC Code"
                value={product.hsnSacCode}
                readOnly
              />
            </div>
          </section>

          {/* ================= PRODUCT ATTRIBUTES ================= */}
          {attributeSchema.length > 0 && (
            <section className="p-5 mt-4 border border-gray-100 vendor-section-card bg-gray-50/50 rounded-2xl">
              <SectionHeader
                icon={FaBox}
                title="Product Attributes"
                description="Applies to all variants"
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {attributeSchema.map((attr) => {
                  const values = productAttributes[attr.attribute_key] || [];

                  return (
                    <div
                      key={attr.attribute_key}
                      className="p-4 border bg-gray-50 rounded-xl"
                    >
                      <p className="mb-1 text-xs font-semibold text-gray-500 uppercase">
                        {attr.attribute_label}
                      </p>

                      <p className="text-sm font-medium text-gray-900">
                        {values.length > 0 ? values.join(", ") : "—"}
                      </p>
                    </div>
                  );
                })}

                {/* Show legacy attributes if schema changed */}
                {Object.keys(productAttributes)
                  .filter(
                    (key) =>
                      !attributeSchema.some((a) => a.attribute_key === key),
                  )
                  .map((key) => (
                    <div
                      key={key}
                      className="p-4 border bg-yellow-50 rounded-xl"
                    >
                      <p className="mb-1 text-xs font-semibold text-gray-500 uppercase">
                        {key.replace(/_/g, " ")} (Legacy)
                      </p>

                      <p className="text-sm font-medium text-gray-900">
                        {productAttributes[key].join(", ")}
                      </p>
                    </div>
                  ))}
              </div>
            </section>
          )}

          {/* ===================== PRODUCT VARIANTS ===================== */}
          {product.variants?.length > 0 && (
            <section className="p-5 mt-4 space-y-4 border border-gray-100 vendor-section-card bg-gray-50/50 rounded-2xl">
              <SectionHeader
                icon={FaBox}
                title="Product Variants"
                description="SKU-wise pricing, attributes and stock details"
              />

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm text-left text-gray-700">
                  <thead>
                    <tr
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.03) 100%)",
                      }}
                    >
                      {[
                        "SKU",
                        "Attributes",
                        "MRP",
                        "Sale Price",
                        "Stock",
                        "Visibility",
                      ].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-xs font-bold tracking-wider text-gray-500 uppercase"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-100">
                    {product.variants.map((variant, index) => (
                      <tr
                        key={variant.variant_id}
                        className="transition-colors row-animate hover:bg-purple-50/20"
                        style={{ animationDelay: `${index * 35}ms` }}
                      >
                        <td className="px-4 py-3 font-medium">{variant.sku}</td>

                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {variant.variant_attributes &&
                              Object.entries(variant.variant_attributes).map(
                                ([key, value]) => (
                                  <span
                                    key={key}
                                    className="px-3 py-1 text-xs font-semibold text-purple-700 border border-purple-200 rounded-full bg-purple-50"
                                  >
                                    {key.toUpperCase()}: {value}
                                  </span>
                                ),
                              )}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          {variant.mrp ? `₹${variant.mrp}` : "—"}
                        </td>

                        <td className="px-4 py-3">
                          {variant.sale_price ? `₹${variant.sale_price}` : "—"}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`px-3 py-1 text-sm font-semibold rounded-full ${
                              variant.stock === 0
                                ? "bg-red-100 text-red-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {variant.stock}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              variant.is_visible
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {variant.is_visible ? "Visible" : "Hidden"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/*  Descriptions */}
          <section className="p-5 mt-4 border border-gray-100 vendor-section-card bg-gray-50/50 rounded-2xl">
            <SectionHeader
              icon={FaBox}
              title="Product Description"
              description="Detailed and short Description"
            />

            {/* Descriptions */}
            <div className="mt-6">
              <div className="mt-4">
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  Detailed Description
                </label>

                <QuillEditor
                  value={product.description || ""}
                  readOnly
                  minHeight={260}
                />
              </div>

              <div className="mt-4">
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  Brand Description
                </label>

                <QuillEditor
                  value={product.brandDescription || ""}
                  readOnly
                  minHeight={220}
                />
              </div>

              <div className="mt-4">
                <FormInput
                  id="shortDescription"
                  label="Short Description"
                  value={product.shortDescription}
                  readOnly
                />
              </div>
            </div>
          </section>

          {/* Pricing & Commercial Controls */}
          <section className="p-5 mt-4 border border-gray-100 vendor-section-card bg-gray-50/50 rounded-2xl">
            <SectionHeader
              icon={FaTag}
              title="Pricing & Commercial Controls"
              description="Discount eligibility and return policy"
            />

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <FormInput
                id="isDiscountEligible"
                label="Discount Eligible"
                value={product.isDiscountEligible === 1 ? "Yes" : "No"}
                readOnly
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
                readOnly
              />
            </div>
          </section>

          {/* Logistics & Fulfilment */}
          <section className="p-5 mt-4 border border-gray-100 vendor-section-card bg-gray-50/50 rounded-2xl">
            <SectionHeader
              icon={FaBox}
              title="Logistics & Fulfilment"
              description="Delivery timeline and shipping classification"
            />

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <FormInput
                id="delivery_sla"
                label="Delivery SLA"
                value={`${product.deliverySlaMinDays} - ${product.deliverySlaMaxDays} days`}
                readOnly
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
                readOnly
              />
            </div>

            <p className="mt-2 text-xs text-gray-500">
              Delivery timeline shown to customers as an estimate. Actual
              delivery may vary by location.
            </p>
          </section>

          {/* Cover Image */}
          <section className="p-5 mt-4 border border-gray-100 vendor-section-card bg-gray-50/50 rounded-2xl">
            <SectionHeader
              icon={FaImages}
              title="Cover Image"
              description="Single cover image for product listing"
            />

            <div className="flex flex-wrap gap-3">
              {product.productImages && product.productImages.length > 0 ? (
                <div
                  className="w-48 h-48 overflow-hidden shadow-md rounded-2xl"
                  style={{ border: "1px solid rgba(133,43,175,0.15)" }}
                >
                  <img
                    src={resolveImageUrl(product.productImages[0])}
                    alt="Cover Image"
                    className="object-cover w-full h-full transition-transform duration-300 hover:scale-105"
                  />
                </div>
              ) : (
                <div
                  className="flex items-center justify-center w-48 h-48 text-sm font-medium text-gray-400 bg-gray-100 rounded-2xl"
                  style={{ border: "1px dashed rgba(133,43,175,0.2)" }}
                >
                  No cover image
                </div>
              )}
            </div>
          </section>

          {/* Product Video */}
          <section className="p-5 mt-4 border border-gray-100 vendor-section-card bg-gray-50/50 rounded-2xl">
            <SectionHeader
              icon={FaImages}
              title="Product Video"
              description="Vendor uploaded demo video"
            />

            {product.productVideo ? (
              <div className="overflow-hidden border rounded w-72">
                <video
                  src={resolveImageUrl(product.productVideo)}
                  controls
                  className="w-full h-full"
                />
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                No product video available
              </div>
            )}
          </section>

          {/* Required Documents (if any) */}
          {product.requiredDocs && product.requiredDocs.length > 0 && (
            <section className="p-5 mt-4 border border-gray-100 vendor-section-card bg-gray-50/50 rounded-2xl">
              <SectionHeader
                icon={FaFileUpload}
                title="Documents"
                description="Uploaded/required documents"
              />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {product.requiredDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-4 bg-white border rounded-lg shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-800">
                          {doc.document_name}
                        </div>
                      </div>

                      {doc.mime_type && doc.mime_type.startsWith("image/") ? (
                        <img
                          src={resolveImageUrl(doc.file_path)}
                          alt={doc.document_name}
                          className="object-cover w-20 h-20 rounded"
                        />
                      ) : doc.url ? (
                        <a
                          href={resolveImageUrl(doc.url)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-blue-600 underline"
                        >
                          View
                        </a>
                      ) : (
                        <div className="text-xs text-gray-500">
                          Not uploaded
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
