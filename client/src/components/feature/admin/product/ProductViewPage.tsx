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
import Swal from "../../../../utils/swalFallback";

// const API_BASE = import.meta.env.VITE_API_URL;
import { api } from "../../../../api/api";
const API_BASEIMAGE_URL = "https://rewardplanners.com/api/crm";

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

interface AttributeSchemaItem {
  attribute_key: string;
  attribute_label: string;
}

interface FormInputProps {
  id: string;
  label: string;
  type?: string;
  value?: string | number;
  placeholder?: string;
}

interface SectionHeaderProps {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  title: string;
  description: string;
}

interface BackendProductRaw {
  product_id?: number | string;
  productId?: number | string;
  product_name?: string;
  productName?: string;
  brand_name?: string;
  brandName?: string;
  manufacturer?: string;
  gst_slab?: string;
  hsn_sac_code?: string;
  description?: string;
  short_description?: string;
  shortDescription?: string;
  brand_description?: string;
  brandDescription?: string;
  category_id?: number | null;
  categoryId?: number | null;
  subcategory_id?: number | null;
  subCategoryId?: number | null;
  sub_subcategory_id?: number | null;
  subSubCategoryId?: number | null;
  category_name?: string | null;
  custom_category?: string | null;
  subcategory_name?: string | null;
  custom_subcategory?: string | null;
  sub_subcategory_name?: string | null;
  custom_sub_subcategory?: string | null;
  status?: string;
  is_discount_eligible?: number;
  is_returnable?: number;
  return_window_days?: number | null;
  delivery_sla_min_days?: number;
  delivery_sla_max_days?: number;
  shipping_class?: "standard" | "bulky" | "fragile";
  productImages?: string[];
  images?: string[];
  video?: string | null;
  documents?: ProductView["requiredDocs"];
  variants?: ProductVariant[];
  attributes?: unknown;
}

const FormInput = ({
  id,
  label,
  type = "text",
  value,
  placeholder = "",
}: FormInputProps) => (
  <div className="flex flex-col space-y-1">
    <label htmlFor={id} className="text-sm font-medium text-gray-700">
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
        className={`p-3 border border-gray-300 rounded-lg bg-gray-50`}
      />
    ) : (
      <input
        type={type}
        id={id}
        name={id}
        value={value ?? ""}
        placeholder={placeholder}
        readOnly
        className={`p-3 border border-gray-300 rounded-lg bg-gray-50`}
      />
    )}
  </div>
);

const SectionHeader = ({ icon: Icon, title, description }: SectionHeaderProps) => (
  <div className="flex items-center pb-2 mb-4 space-x-3 border-b">
    <Icon className="text-2xl" style={{ color: "#852BAF" }} />
    <div>
      <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-500">{description}</p>
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
  const [attributeSchema, setAttributeSchema] = useState<AttributeSchemaItem[]>([]);
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
    return `${API_BASEIMAGE_URL}/uploads/${path.replace(/^\/+/, "")}`;
  };

  const fetchProduct = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get(`/product/${encodeURIComponent(id)}`);
      const json = res.data;

      const raw = (json.data ?? json.product ?? json) as BackendProductRaw;

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
        let parsedAttributes: unknown = raw.attributes;

        try {
          // Step 1: parse outer layer if string
          if (typeof parsedAttributes === "string") {
            parsedAttributes = JSON.parse(parsedAttributes);
          }

          // Step 2: if it still has nested "attributes", parse again
          if (
            typeof parsedAttributes === "object" &&
            parsedAttributes !== null &&
            "attributes" in parsedAttributes &&
            typeof (parsedAttributes as { attributes?: unknown }).attributes === "string"
          ) {
            parsedAttributes = JSON.parse(
              (parsedAttributes as { attributes: string }).attributes,
            );
          }
        } catch (e) {
          console.error("Attribute JSON parse failed", e);
          parsedAttributes = {};
        }

        setProductAttributes(parsedAttributes as Record<string, string[]>);
      }

      setProduct(mapped);

      // reward Limit
      const initialLimits: Record<number, number> = {};

      (mapped.variants || []).forEach((v: ProductVariant) => {
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
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load product");
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

  return (
    <div className="p-6" style={{ backgroundColor: "#FFFAFB" }}>
      <div className="p-6 mx-auto bg-white border border-gray-100 shadow-xl rounded-2xl max-w-7xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="mb-1 text-3xl font-bold text-gray-900">
              Product Review
            </h1>
            <div className="text-sm font-bold text-gray-900">
              Viewing product ID: {product.productId}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => navigate(-1)} // router.back() becomes navigate(-1)
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg
           bg-[#852BAF] text-white transition-all duration-300
           hover:bg-gradient-to-r hover:from-[#852BAF] hover:to-[#FC3F78]
           hover:text-white cursor-pointer"
            >
              <FaArrowLeft /> Back
            </button>
          </div>
        </div>

        {/* Section: Category Selection */}
        <section>
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

        {/* Section: Product Identification */}
        <section className="mt-6">
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
              label="GST Slab (%) "
              value={product.gstSlab}
            />

            <FormInput
              id="hsnSacCode"
              label="HSN / SAC Code"
              value={product.hsnSacCode}
            />
          </div>
        </section>

        {/* ================= PRODUCT ATTRIBUTES ================= */}
        {attributeSchema.length > 0 && (
          <section className="mt-6">
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
                  <div key={key} className="p-4 border bg-yellow-50 rounded-xl">
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
          <section className="mt-6 space-y-4">
            <SectionHeader
              icon={FaBox}
              title="Product Variants"
              description="SKU-wise pricing, attributes and stock details"
            />

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm text-left text-gray-700">
                <thead className="text-xs text-gray-600 uppercase bg-gray-100">
                  <tr>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Attributes</th>
                    <th className="px-4 py-3">MRP</th>
                    <th className="px-4 py-3">Sale Price</th>
                    <th className="px-4 py-3">Stock</th>
                    <th className="px-4 py-3">Visibility</th>
                    <th className="px-4 py-3">Reward Redemption Limit (%)</th>
                  </tr>
                </thead>

                <tbody>
                  {product.variants.map((variant) => (
                    <tr
                      key={variant.variant_id}
                      className="border-t hover:bg-gray-50"
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
                            className="w-24 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#852BAF]"
                            placeholder="Limit"
                          />

                          <button
                            onClick={() =>
                              updateRewardLimit(variant.variant_id)
                            }
                            disabled={savingLimit[variant.variant_id]}
                            className="flex items-center justify-center p-2 text-white bg-green-600 rounded-lg cursor-pointer hover:bg-green-700 disabled:opacity-50"
                          >
                            {savingLimit[variant.variant_id] ? (
                              <FaSpinner className="text-sm animate-spin" />
                            ) : (
                              <FaCheck className="text-sm" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Section: Description */}
        <section className="mt-6">
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
              />
            </div>
          </div>
        </section>

        {/* Pricing & Commercial Controls */}
        <section className="mt-6">
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
        </section>

        {/* Logistics & Fulfilment */}
        <section className="mt-6">
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

          <p className="mt-2 text-xs text-gray-500">
            Delivery timeline shown to customers as an estimate. Actual delivery
            may vary by location.
          </p>
        </section>

        {/* Section: Cover Image */}
        <section className="mt-6">
          <SectionHeader
            icon={FaImages}
            title="Cover Image"
            description="Single cover image for product listing"
          />

          {coverImage ? (
            <div className="relative w-32 h-32 overflow-hidden border rounded group">
              <img
                src={resolveImageUrl(coverImage)}
                alt="Cover Image"
                className="object-cover w-full h-full"
              />

              <button
                onClick={() =>
                  downloadFile(resolveImageUrl(coverImage), "cover-image.jpg")
                }
                className="absolute p-1 text-xs text-white transition rounded opacity-0 cursor-pointer bottom-1 right-1 bg-black/60 group-hover:opacity-100"
              >
                <FaDownload className="text-sm" />
              </button>
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              No cover image available
            </div>
          )}
        </section>

        {/* Product Video */}
        <section className="mt-6">
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

        {/* Section: Documents */}
        {product.requiredDocs && product.requiredDocs.length > 0 && (
          <section className="mt-6">
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
                    className="p-4 bg-white border rounded-lg shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">
                          {doc.document_name}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {doc.mime_type || "Unknown type"}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {doc.mime_type?.startsWith("image/") && (
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <img
                              src={fileUrl}
                              alt={doc.document_name}
                              className="object-cover w-16 h-16 border rounded cursor-pointer hover:opacity-90"
                            />
                          </a>
                        )}
                        <button
                          onClick={() =>
                            downloadFile(fileUrl, doc.document_name)
                          }
                          className="px-3 py-1.5 text-sm font-medium text-white bg-[#852BAF] rounded hover:bg-[#76209e]"
                        >
                          <FaDownload className="text-sm" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
