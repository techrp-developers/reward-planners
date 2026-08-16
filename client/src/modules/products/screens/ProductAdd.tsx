import React, { useState, useEffect } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { ComponentType } from "react";
import { api } from "../../../common/api/api";
import QuillEditor from "../components/QuillEditor";
import Swal from "sweetalert2";

type IconComp = ComponentType<any>;

interface ImagePreview {
  file: File;
  url: string;
}

interface VideoPreview {
  file: File;
  url: string;
}

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
    <div className="flex items-center space-x-4 pb-4 border-b border-gray-100 mb-6">
      <div
        className="p-3.5 text-white rounded-2xl shrink-0"
        style={{
          background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
          boxShadow: "0 6px 20px rgba(133,43,175,0.25)",
        }}
      >
        <Icon className="text-lg" />
      </div>
      <div>
        <h3 className="text-base font-extrabold text-gray-800 tracking-tight">
          {title}
        </h3>
        {description && (
          <p className="mt-0.5 text-xs text-gray-500 font-medium">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

const inputCls =
  "w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-[#852BAF]/20 focus:border-[#852BAF] focus:bg-white transition-all outline-none text-sm text-gray-800 placeholder:text-gray-400";

const labelCls = "block text-sm font-semibold text-gray-700 mb-1.5";

function FormInput(props: {
  id: string;
  label: string;
  value?: string | number;
  onChange: (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  error?: string;
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
  } = props;
  return (
    <div className="flex flex-col space-y-1">
      <label htmlFor={id} className={labelCls}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={id}
        name={id}
        value={value}
        onChange={onChange}
        type={type}
        placeholder={placeholder}
        required={required}
        className={inputCls}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

import {
  FaTag,
  FaBox,
  FaImages,
  FaFileUpload,
  FaTrash,
  FaSpinner,
} from "react-icons/fa";

// --- Interfaces matching your backend ---
interface Category {
  category_id: number;
  category_name: string;
  variant_type?: string;
  is_custom?: boolean;
}

interface SubCategory {
  subcategory_id: number;
  category_id: number;
  subcategory_name: string;
}

interface SubSubCategory {
  sub_subcategory_id: number;
  subcategory_id: number;
  name: string;
  attributes?: any;
}

interface RequiredDocument {
  document_id: number;
  document_name: string;
  status: number;
}

interface CategoryAttribute {
  attribute_key: string;
  attribute_label: string;
  is_required: number;
  is_variant: number;
  input_type: string;
  options?: string[];
}

interface ProductData {
  productName: string;
  brandName: string;
  manufacturer: string;
  gstSlab: string;
  hsnSacCode: string;
  description: string;
  shortDescription: string;
  brandDescription: string;
  categoryId: number | null;
  subCategoryId: number | null;
  subSubCategoryId: number | null;
  productImages: ImagePreview[];
  isDiscountEligible: 1 | 0;
  isReturnable: 1 | 0;
  isReplaceable: 1 | 0;
  returnWindowDays: string;
  deliveryMinDays: string;
  deliveryMaxDays: string;
  shippingClass: "standard" | "bulky" | "fragile";
  productVideo: VideoPreview | null;
}

const initialProductData: ProductData = {
  brandName: "",
  manufacturer: "",
  productName: "",
  gstSlab: "",
  hsnSacCode: "",
  description: "",
  shortDescription: "",
  brandDescription: "",
  categoryId: null,
  subCategoryId: null,
  subSubCategoryId: null,
  productImages: [],
  isDiscountEligible: 1,
  isReturnable: 1,
  isReplaceable: 1,
  returnWindowDays: "",
  deliveryMinDays: "1",
  deliveryMaxDays: "3",
  shippingClass: "standard",
  productVideo: null,
};

export default function ProductListingDynamic() {
  const [product, setProduct] = useState<ProductData>(initialProductData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
  const [subSubCategories, setSubSubCategories] = useState<SubSubCategory[]>(
    [],
  );
  const [requiredDocs, setRequiredDocs] = useState<RequiredDocument[]>([]);
  const [docFiles, setDocFiles] = useState<Record<number, File | null>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [isCustomSubcategory, setIsCustomSubcategory] = useState(false);
  const [isCustomSubSubcategory, setIsCustomSubSubcategory] = useState(false);
  const [imageError, setImageError] = useState("");
  const [videoError, setVideoError] = useState("");
  const [custom_category, setCustomCategory] = useState("");
  const [custom_subcategory, setCustomSubCategory] = useState("");
  const [custom_subsubcategory, setCustomSubSubCategory] = useState("");
  const [categoryAttributes, setCategoryAttributes] = useState<
    CategoryAttribute[]
  >([]);
  const [productAttributes, setProductAttributes] = useState<
    Record<string, string[]>
  >({});

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await api.get("/category");
      if (res.data.success) setCategories(res.data.data);
    } catch {
      setError("Failed to load categories");
    } finally {
      setLoading(false);
    }
  };

  const handleMainImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const file = e.target.files[0];
    if (!file.type.startsWith("image/")) {
      setImageError("Only image files are allowed.");
      return;
    }
    const preview = { file, url: URL.createObjectURL(file) };
    setProduct((prev) => {
      prev.productImages.forEach((img) => URL.revokeObjectURL(img.url));
      return { ...prev, productImages: [preview] };
    });
    setImageError("");
    e.target.value = "";
  };

  const handleProductVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const file = e.target.files[0];
    if (file.size > 50 * 1024 * 1024) {
      setVideoError("Video size must be under 50MB.");
      return;
    }
    const preview = { file, url: URL.createObjectURL(file) };
    setProduct((prev) => ({ ...prev, productVideo: preview }));
    setVideoError("");
    e.target.value = "";
  };

  const removeVideo = () => {
    if (product.productVideo) URL.revokeObjectURL(product.productVideo.url);
    setProduct((prev) => ({ ...prev, productVideo: null }));
  };

  useEffect(() => {
    if (product.categoryId) {
      fetchSubCategories(product.categoryId);
      fetchRequiredDocuments(product.categoryId);
    } else {
      setSubCategories([]);
      setSubSubCategories([]);
      setRequiredDocs([]);
      setDocFiles({});
    }
  }, [product.categoryId]);

  useEffect(() => {
    if (!product.subCategoryId) {
      setCategoryAttributes([]);
      setProductAttributes({});
      return;
    }
    const params = new URLSearchParams({
      categoryId: String(product.categoryId),
      subcategoryId: String(product.subCategoryId),
    });
    api.get(`/category/attributes?${params.toString()}`).then((res) => {
      if (res.data.success) {
        const attrs = res.data.data;
        setCategoryAttributes(attrs);
        setProductAttributes((prev) => {
          const next: Record<string, string[]> = {};
          (attrs as CategoryAttribute[]).forEach((attr) => {
            next[attr.attribute_key] = prev[attr.attribute_key] || [];
          });
          return next;
        });
      }
    });
  }, [product.subCategoryId]);

  useEffect(() => {
    if (product.subCategoryId) {
      fetchSubSubCategories(product.subCategoryId);
    } else {
      setSubSubCategories([]);
      setProduct((prev) => ({ ...prev, subSubCategoryId: null }));
    }
  }, [product.subCategoryId]);

  const fetchSubCategories = async (categoryId: number) => {
    const res = await api.get(`/subcategory/${categoryId}`);
    if (res.data.success) setSubCategories(res.data.data);
  };

  const fetchSubSubCategories = async (subcategoryId: number) => {
    const res = await api.get(`/subsubcategory/${subcategoryId}`);
    if (res.data.success) setSubSubCategories(res.data.data);
  };

  const fetchRequiredDocuments = async (categoryId: number) => {
    const res = await api.get(`/product/category/required_docs/${categoryId}`);
    if (res.data.success) {
      setRequiredDocs(res.data.data || []);
      setDocFiles({});
    }
  };

  const handleFieldChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    if (name === "category_id") {
      setProduct((prev) => ({
        ...prev,
        categoryId: value ? Number(value) : null,
        subCategoryId: null,
        subSubCategoryId: null,
      }));
      return;
    }
    if (name === "subcategory_id") {
      setProduct((prev) => ({
        ...prev,
        subCategoryId: value ? Number(value) : null,
        subSubCategoryId: null,
      }));
      return;
    }
    if (name === "sub_subcategory_id") {
      setProduct((prev) => ({
        ...prev,
        subSubCategoryId: value ? Number(value) : null,
      }));
      return;
    }
    setProduct((prev) => ({ ...prev, [name]: value }));
  };

  const CHAR_LIMIT = 170;

  const handleShortDescriptionChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const value = e.target.value;
    if (value.length <= CHAR_LIMIT) {
      setProduct((prev) => ({ ...prev, shortDescription: value }));
    }
  };

  const removeMainImage = (index: number) => {
    setProduct((prev) => {
      const updatedImages = [...prev.productImages];
      URL.revokeObjectURL(updatedImages[index].url);
      updatedImages.splice(index, 1);
      return { ...prev, productImages: updatedImages };
    });
  };

  const onDocInputChange = (
    e: ChangeEvent<HTMLInputElement>,
    documentId: number,
  ) => {
    const file = e.target.files?.[0] ?? null;
    setDocFiles((prev) => ({ ...prev, [documentId]: file }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const selectedVariantAttributes = categoryAttributes.filter((attribute) => attribute.is_variant === 1);
    const combinations = selectedVariantAttributes.reduce((count, attribute) => {
      const optionCount = new Set((productAttributes[attribute.attribute_key] || []).filter(Boolean)).size;
      return optionCount ? count * optionCount : count;
    }, 1);
    if (combinations > 100) {
      setError(`This selection creates ${combinations} variants. Reduce it to 100 combinations or fewer.`);
      return;
    }

    const missingAttrs = categoryAttributes.filter((attr) => {
      if (attr.is_required !== 1) return false;
      const val = productAttributes[attr.attribute_key];
      return (
        !val ||
        !Array.isArray(val) ||
        val.length === 0 ||
        val.every((v) => !v || v.trim() === "")
      );
    });

    if (missingAttrs.length > 0) {
      setError(
        `Please fill required attributes: ${missingAttrs.map((a) => a.attribute_label).join(", ")}`,
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      if (!product.categoryId && !isCustomCategory)
        throw new Error("Please select a category");
      if (isCustomCategory && !custom_category.trim())
        throw new Error("Please enter custom category name");
      if (isCustomSubcategory && !custom_subcategory.trim())
        throw new Error("Please enter custom sub-category name");
      if (isCustomSubSubcategory && !custom_subsubcategory.trim())
        throw new Error("Please enter custom type / sub-type name");
      if (!product.productName || !product.brandName || !product.manufacturer)
        throw new Error("Please fill in all required product information");
      if (!product.description?.trim())
        throw new Error("Detailed description is required");
      if (!product.brandDescription?.trim())
        throw new Error("Brand description is required");
      if (!product.shortDescription?.trim())
        throw new Error("Short description is required");

      const minDays = Number(product.deliveryMinDays);
      const maxDays = Number(product.deliveryMaxDays);
      if (minDays <= 0 || maxDays <= 0)
        throw new Error("Delivery days must be greater than 0");
      if (minDays > maxDays)
        throw new Error(
          "Minimum delivery days cannot exceed maximum delivery days",
        );

      if (product.isReturnable === 1) {
        const days = Number(product.returnWindowDays);
        if (!days || days < 1 || days > 30)
          throw new Error("Return window must be between 1 and 30 days");
      }

      for (const doc of requiredDocs) {
        if (doc.status === 1 && !docFiles[doc.document_id])
          throw new Error(
            `Please upload required document: ${doc.document_name}`,
          );
      }

      if (product.productImages.length === 0)
        throw new Error("Cover image is required");

      const formData = new FormData();
      if (product.categoryId)
        formData.append("category_id", product.categoryId.toString());
      if (product.subCategoryId)
        formData.append("subcategory_id", product.subCategoryId.toString());
      if (product.subSubCategoryId)
        formData.append(
          "sub_subcategory_id",
          product.subSubCategoryId.toString(),
        );
      if (isCustomCategory && custom_category.trim())
        formData.append("custom_category", custom_category.trim());
      if (isCustomSubcategory)
        formData.append("custom_subcategory", custom_subcategory);
      if (isCustomSubSubcategory)
        formData.append("custom_sub_subcategory", custom_subsubcategory);

      formData.append("brandName", product.brandName);
      formData.append("manufacturer", product.manufacturer);
      formData.append("productName", product.productName);
      formData.append("description", product.description);
      formData.append("shortDescription", product.shortDescription);
      formData.append("brandDescription", product.brandDescription);
      if (product.gstSlab) formData.append("gstSlab", product.gstSlab);
      if (product.hsnSacCode) formData.append("hsnSacCode", product.hsnSacCode);
      formData.append(
        "is_discount_eligible",
        String(product.isDiscountEligible),
      );
      formData.append("is_returnable", String(product.isReturnable));
      formData.append("is_replaceable", String(product.isReplaceable));
      if (product.isReturnable === 1 && product.returnWindowDays)
        formData.append("return_window_days", product.returnWindowDays);
      formData.append("delivery_sla_min_days", product.deliveryMinDays);
      formData.append("delivery_sla_max_days", product.deliveryMaxDays);
      formData.append("shipping_class", product.shippingClass);
      product.productImages.forEach(({ file }) =>
        formData.append("images", file),
      );
      if (product.productVideo)
        formData.append("video", product.productVideo.file);
      Object.entries(docFiles).forEach(([docId, file]) => {
        if (file) formData.append(docId, file);
      });
      formData.append("attributes", JSON.stringify(productAttributes));

      const res = await api.post("/product/create-product", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (!res.data.success)
        throw new Error(res.data.message || "Failed to create product");

      Swal.fire({
        icon: "success",
        title: "Product Created!",
        text: "Your product has been listed successfully.",
        confirmButtonColor: "#852BAF",
      });

      setProduct(initialProductData);
      setDocFiles({});
      setRequiredDocs([]);
      product.productImages.forEach((img) => URL.revokeObjectURL(img.url));
      if (product.productVideo) URL.revokeObjectURL(product.productVideo.url);
    } catch (err: any) {
      console.error("Submit error:", err);
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDocUploads = () => {
    if (requiredDocs.length === 0) return null;
    return (
      <section
        className="bg-white rounded-2xl p-6 sm:p-8 vendor-section-card"
        style={{
          border: "1px solid rgba(133,43,175,0.08)",
          boxShadow: "0 4px 24px rgba(133,43,175,0.06)",
        }}
      >
        <SectionHeader
          icon={FaFileUpload}
          title="Required Documents"
          description="Upload documents required by category"
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {requiredDocs.map((doc) => (
            <div
              key={doc.document_id}
              className="p-4 rounded-xl border transition-colors"
              style={{
                background: "rgba(133,43,175,0.02)",
                borderColor: "rgba(133,43,175,0.1)",
              }}
            >
              <label className={labelCls}>
                {doc.document_name}{" "}
                {doc.status === 1 && <span className="text-red-500">*</span>}
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {doc.status === 1 ? "(Required)" : "(Optional)"}
                </span>
              </label>
              <input
                type="file"
                accept=".pdf,image/*,.doc,.docx,.png,.jpg,.jpeg"
                onChange={(e) => onDocInputChange(e, doc.document_id)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:text-white file:cursor-pointer"
              />
              <div className="mt-2 text-xs text-gray-400">
                Accepted: PDF, DOC, DOCX, JPG, PNG
              </div>
              {docFiles[doc.document_id] && (
                <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600 font-medium">
                  <span>✓</span>
                  <span>{docFiles[doc.document_id]?.name}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  };

  const getSelectedCategoryName = () =>
    categories.find((c) => c.category_id === product.categoryId)
      ?.category_name || "Not selected";

  const getSelectedSubCategoryName = () =>
    subCategories.find((s) => s.subcategory_id === product.subCategoryId)
      ?.subcategory_name || "Not selected";

  const getSelectedSubSubCategoryName = () =>
    subSubCategories.find(
      (ss) => ss.sub_subcategory_id === product.subSubCategoryId,
    )?.name || "Not selected";

  const variantAttributes = categoryAttributes.filter((attribute) => attribute.is_variant === 1);
  const variantCombinationCount = variantAttributes.reduce((count, attribute) => {
    const selectedCount = new Set((productAttributes[attribute.attribute_key] || []).filter(Boolean)).size;
    return selectedCount ? count * selectedCount : count;
  }, 1);

  if (loading && categories.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <FaSpinner className="animate-spin text-3xl text-[#852BAF]" />
        <span className="ml-3 text-gray-600 text-lg">Loading categories…</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* ── PAGE HEADER ── */}
      <div
        className="flex items-center justify-between mb-6 p-5 rounded-2xl"
        style={{
          background:
            "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            New <span className="gradient-text-brand">Product Listing</span>
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">
            Fill in the details below to list your product
          </p>
        </div>
        {/* <div
          className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white"
          style={{
            background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
          }}
        >
          <FaPlus size={10} /> New Product
        </div> */}
      </div>

      {/* ── ALERTS ── */}
      {error && (
        <div
          className="flex items-start gap-3 p-4 mb-6 rounded-xl border"
          style={{
            background: "rgba(239,68,68,0.04)",
            borderColor: "rgba(239,68,68,0.2)",
          }}
        >
          <p className="text-sm font-medium text-red-700">⚠ {error}</p>
        </div>
      )}
      {success && (
        <div
          className="flex items-start gap-3 p-4 mb-6 rounded-xl border"
          style={{
            background: "rgba(16,185,129,0.04)",
            borderColor: "rgba(16,185,129,0.2)",
          }}
        >
          <p className="text-sm font-medium text-emerald-700">✓ {success}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── CATEGORY SELECTION ── */}
        <section
          className="bg-white rounded-2xl p-6 sm:p-8 vendor-section-card"
          style={{
            border: "1px solid rgba(133,43,175,0.08)",
            boxShadow: "0 4px 24px rgba(133,43,175,0.06)",
          }}
        >
          <SectionHeader
            icon={FaTag}
            title="Category Selection"
            description="Choose category, sub-category and type"
          />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Category */}
            <div>
              <label className={labelCls}>
                Category <span className="text-red-500">*</span>
              </label>
              <select
                name="category_id"
                value={isCustomCategory ? "other" : product.categoryId || ""}
                onChange={(e) => {
                  if (e.target.value === "other") {
                    setIsCustomCategory(true);
                    setIsCustomSubcategory(true);
                    setIsCustomSubSubcategory(true);
                    setProduct((prev) => ({
                      ...prev,
                      categoryId: null,
                      subCategoryId: null,
                      subSubCategoryId: null,
                    }));
                  } else {
                    setIsCustomCategory(false);
                    setIsCustomSubcategory(false);
                    setIsCustomSubSubcategory(false);
                    setCustomCategory("");
                    setCustomSubCategory("");
                    setCustomSubSubCategory("");
                    handleFieldChange(e);
                  }
                }}
                className={inputCls}
              >
                <option value="">Select Category</option>
                {categories.map((c) => (
                  <option key={c.category_id} value={c.category_id}>
                    {c.category_name}
                  </option>
                ))}
                <option value="other">Other (Custom)</option>
              </select>

              {isCustomCategory && (
                <input
                  type="text"
                  value={custom_category}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Enter new category name"
                  className={`${inputCls} mt-3`}
                />
              )}
            </div>

            {/* Sub Category */}
            <div>
              <label className={labelCls}>Sub Category</label>
              <select
                name="subcategory_id"
                value={
                  isCustomSubcategory ? "other" : product.subCategoryId || ""
                }
                onChange={(e) => {
                  if (e.target.value === "other") {
                    setIsCustomSubcategory(true);
                    setIsCustomSubSubcategory(true);
                    setProduct((prev) => ({
                      ...prev,
                      subCategoryId: null,
                      subSubCategoryId: null,
                    }));
                  } else {
                    setIsCustomSubcategory(false);
                    setIsCustomSubSubcategory(false);
                    setCustomSubCategory("");
                    handleFieldChange(e);
                  }
                }}
                disabled={!product.categoryId && !isCustomCategory}
                className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <option value="">Select Sub Category</option>
                {subCategories.map((s) => (
                  <option key={s.subcategory_id} value={s.subcategory_id}>
                    {s.subcategory_name}
                  </option>
                ))}
                <option value="other">Other (Custom)</option>
              </select>

              {isCustomSubcategory && (
                <input
                  type="text"
                  value={custom_subcategory}
                  onChange={(e) => setCustomSubCategory(e.target.value)}
                  placeholder="Enter custom sub-category"
                  className={`${inputCls} mt-3`}
                />
              )}
            </div>

            {/* Sub Sub Category */}
            <div>
              <label className={labelCls}>Type / Sub-type</label>
              <select
                name="sub_subcategory_id"
                value={
                  isCustomSubSubcategory
                    ? "other"
                    : product.subSubCategoryId || ""
                }
                onChange={(e) => {
                  if (e.target.value === "other") {
                    setIsCustomSubSubcategory(true);
                    setProduct((prev) => ({ ...prev, subSubCategoryId: null }));
                  } else {
                    setIsCustomSubSubcategory(false);
                    setCustomSubSubCategory("");
                    handleFieldChange(e);
                  }
                }}
                disabled={!product.subCategoryId && !isCustomSubcategory}
                className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <option value="">Select Type</option>
                {subSubCategories.map((t) => (
                  <option
                    key={t.sub_subcategory_id}
                    value={t.sub_subcategory_id}
                  >
                    {t.name}
                  </option>
                ))}
                <option value="other">Other (Custom)</option>
              </select>

              {isCustomSubSubcategory && (
                <input
                  type="text"
                  value={custom_subsubcategory}
                  onChange={(e) => setCustomSubSubCategory(e.target.value)}
                  placeholder="Enter custom type / sub-type"
                  className={`${inputCls} mt-3`}
                />
              )}
            </div>
          </div>

          {/* Selected Categories Display */}
          {(product.categoryId ||
            product.subCategoryId ||
            product.subSubCategoryId) && (
            <div
              className="flex flex-wrap items-center gap-2 mt-5 p-3 rounded-xl"
              style={{
                background: "rgba(133,43,175,0.04)",
                border: "1px solid rgba(133,43,175,0.12)",
              }}
            >
              <span className="text-xs font-semibold text-gray-500 mr-1">
                Selected:
              </span>
              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">
                {getSelectedCategoryName()}
              </span>
              {product.subCategoryId && (
                <>
                  <span className="text-gray-400 text-xs">›</span>
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-pink-100 text-pink-700">
                    {getSelectedSubCategoryName()}
                  </span>
                </>
              )}
              {product.subSubCategoryId && (
                <>
                  <span className="text-gray-400 text-xs">›</span>
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700">
                    {getSelectedSubSubCategoryName()}
                  </span>
                </>
              )}
              {requiredDocs.length > 0 && (
                <span className="ml-auto text-xs text-gray-400">
                  {requiredDocs.filter((doc) => doc.status === 1).length}{" "}
                  required doc(s)
                </span>
              )}
            </div>
          )}
        </section>

        {/* ── PRODUCT IDENTIFICATION ── */}
        <section
          className="bg-white rounded-2xl p-6 sm:p-8 vendor-section-card"
          style={{
            border: "1px solid rgba(133,43,175,0.08)",
            boxShadow: "0 4px 24px rgba(133,43,175,0.06)",
          }}
        >
          <SectionHeader
            icon={FaTag}
            title="Product Identification"
            description="Basic product information"
          />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            <FormInput
              id="productName"
              label="Product Name"
              required
              value={product.productName}
              onChange={handleFieldChange}
              placeholder="Type of product (e.g., Shoes, TV)"
            />
            <FormInput
              id="brandName"
              label="Brand"
              required
              value={product.brandName}
              onChange={handleFieldChange}
              placeholder="Nike, Samsung, Puma"
            />
            <FormInput
              id="manufacturer"
              label="Manufacturer"
              required
              value={product.manufacturer}
              onChange={handleFieldChange}
              placeholder="Manufacturer name"
            />
            <FormInput
              id="gstSlab"
              label="GST Slab (%)"
              type="number"
              value={product.gstSlab}
              onChange={handleFieldChange}
              placeholder="e.g. 5, 12, 18, 28"
            />
            <FormInput
              id="hsnSacCode"
              label="HSN / SAC Code"
              value={product.hsnSacCode}
              onChange={handleFieldChange}
              placeholder="Enter HSN or SAC code"
            />
          </div>
        </section>

        {/* ── PRODUCT ATTRIBUTES ── */}
        <section
          className="bg-white rounded-2xl p-6 sm:p-8 vendor-section-card"
          style={{
            border: "1px solid rgba(133,43,175,0.08)",
            boxShadow: "0 4px 24px rgba(133,43,175,0.06)",
          }}
        >
          <SectionHeader
            icon={FaBox}
            title="Product Attributes"
            description="Select available options for this product"
          />

          {!isCustomCategory && categoryAttributes.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {categoryAttributes.map((attr) => {
                const inputType = attr.input_type?.trim().toLowerCase();
                return (
                  <div key={attr.attribute_key}>
                    <label className={labelCls}>
                      {attr.attribute_label}
                      {attr.is_required === 1 && (
                        <span className="text-red-500 ml-0.5">*</span>
                      )}
                      {attr.is_variant === 1 && <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#852BAF]">Variant option</span>}
                    </label>

                    {inputType === "multiselect" && (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {(attr.options || []).map((opt: string) => {
                          const selected =
                            productAttributes[attr.attribute_key]?.includes(
                              opt,
                            );
                          return (
                            <label
                              key={opt}
                              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border cursor-pointer transition-all ${
                                selected
                                  ? "bg-purple-100 text-purple-700 border-purple-300"
                                  : "bg-gray-50 text-gray-600 border-gray-200 hover:border-[#852BAF]/40"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                className="sr-only"
                                onChange={(e) => {
                                  const prevVals =
                                    productAttributes[attr.attribute_key] || [];
                                  const newVals = e.target.checked
                                    ? [...prevVals, opt]
                                    : prevVals.filter((v: string) => v !== opt);
                                  setProductAttributes((prev) => ({
                                    ...prev,
                                    [attr.attribute_key]: newVals,
                                  }));
                                }}
                              />
                              {opt}
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {inputType === "select" && (
                      <select
                        required={attr.is_required === 1}
                        value={
                          (productAttributes[attr.attribute_key] || [])[0] || ""
                        }
                        onChange={(e) =>
                          setProductAttributes((prev) => ({
                            ...prev,
                            [attr.attribute_key]: [e.target.value],
                          }))
                        }
                        className={inputCls}
                      >
                        <option value="">Select {attr.attribute_label}</option>
                        {(attr.options || []).map((opt: string) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}

                    {inputType === "number" && (
                      <input
                        type="number"
                        required={attr.is_required === 1}
                        value={
                          (productAttributes[attr.attribute_key] || [])[0] || ""
                        }
                        onChange={(e) =>
                          setProductAttributes((prev) => ({
                            ...prev,
                            [attr.attribute_key]: [e.target.value],
                          }))
                        }
                        className={inputCls}
                      />
                    )}

                    {inputType === "text" && (
                      <input
                        type="text"
                        required={attr.is_required === 1}
                        value={(
                          productAttributes[attr.attribute_key] || []
                        ).join(",")}
                        onChange={(e) =>
                          setProductAttributes((prev) => ({
                            ...prev,
                            [attr.attribute_key]: [e.target.value],
                          }))
                        }
                        className={inputCls}
                      />
                    )}

                    {inputType === "textarea" && (
                      <textarea
                        required={attr.is_required === 1}
                        value={
                          (productAttributes[attr.attribute_key] || [])[0] || ""
                        }
                        onChange={(e) =>
                          setProductAttributes((prev) => ({
                            ...prev,
                            [attr.attribute_key]: [e.target.value],
                          }))
                        }
                        className={`${inputCls} resize-none`}
                        rows={3}
                        placeholder={attr.attribute_label}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">
              {isCustomCategory
                ? "Attributes are not available for custom categories."
                : "Select a category and sub-category to see product attributes."}
            </p>
          )}
          {variantAttributes.length > 0 && <div className={`mt-6 rounded-2xl border p-4 ${variantCombinationCount > 100 ? "border-red-200 bg-red-50" : "border-purple-100 bg-purple-50/60"}`}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-extrabold text-slate-800">Variant matrix preview</p><p className="mt-1 text-xs text-slate-500">Each unique option combination becomes a separately managed SKU.</p></div><span className={`rounded-xl px-4 py-2 text-sm font-black ${variantCombinationCount > 100 ? "bg-red-100 text-red-700" : "bg-white text-[#852BAF] shadow-sm"}`}>{variantCombinationCount} combination{variantCombinationCount === 1 ? "" : "s"}</span></div>{variantCombinationCount > 100 && <p className="mt-3 text-xs font-bold text-red-600">Reduce the selected options to 100 combinations or fewer.</p>}</div>}
        </section>

        {/* ── PRODUCT DESCRIPTION ── */}
        <section
          className="bg-white rounded-2xl p-6 sm:p-8 vendor-section-card"
          style={{
            border: "1px solid rgba(133,43,175,0.08)",
            boxShadow: "0 4px 24px rgba(133,43,175,0.06)",
          }}
        >
          <SectionHeader
            icon={FaBox}
            title="Product Description"
            description="Describe the product in detail and add a short summary"
          />

          <div className="space-y-6">
            <div>
              <label className={labelCls}>
                Detailed Description <span className="text-red-500">*</span>
              </label>
              <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden">
                <QuillEditor
                  value={product.description}
                  placeholder="Describe your product, features, benefits, specifications, and usage instructions..."
                  minHeight={300}
                  onChange={(val) =>
                    setProduct((prev) => ({ ...prev, description: val }))
                  }
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>
                Brand Description <span className="text-red-500">*</span>
              </label>
              <div className="mt-1 border border-gray-200 rounded-xl overflow-hidden">
                <QuillEditor
                  value={product.brandDescription}
                  placeholder="Describe the brand story, values, quality standards, and brand background..."
                  minHeight={200}
                  onChange={(val) =>
                    setProduct((prev) => ({ ...prev, brandDescription: val }))
                  }
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>
                Short Description <span className="text-red-500">*</span>
              </label>
              <textarea
                id="shortDescription"
                name="shortDescription"
                value={product.shortDescription}
                onChange={handleShortDescriptionChange}
                placeholder="Short description (max 170 characters)"
                rows={3}
                className={`${inputCls} resize-none`}
              />
              <p
                className={`mt-1 text-xs font-medium ${
                  product.shortDescription.length >= CHAR_LIMIT
                    ? "text-red-500"
                    : "text-gray-400"
                }`}
              >
                {product.shortDescription.length} / {CHAR_LIMIT}
              </p>
            </div>
          </div>
        </section>

        {/* ── PRICING & COMMERCIAL ── */}
        <section
          className="bg-white rounded-2xl p-6 sm:p-8 vendor-section-card"
          style={{
            border: "1px solid rgba(133,43,175,0.08)",
            boxShadow: "0 4px 24px rgba(133,43,175,0.06)",
          }}
        >
          <SectionHeader
            icon={FaTag}
            title="Pricing & Commercial Controls"
            description="Define discount eligibility and return policies"
          />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div>
              <label className={labelCls}>Discount Eligible</label>
              <select
                name="isDiscountEligible"
                value={product.isDiscountEligible}
                onChange={(e) =>
                  setProduct((prev) => ({
                    ...prev,
                    isDiscountEligible: Number(e.target.value) as 1 | 0,
                  }))
                }
                className={inputCls}
              >
                <option value={1}>Yes</option>
                <option value={0}>No</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>Returnable</label>
              <select
                name="isReturnable"
                value={product.isReturnable}
                onChange={(e) => {
                  const val = Number(e.target.value) as 1 | 0;

                  setProduct((prev) => ({
                    ...prev,
                    isReturnable: val,
                    isReplaceable: val === 0 ? 0 : prev.isReplaceable,
                    returnWindowDays: val === 0 ? "" : prev.returnWindowDays,
                  }));
                }}
                className={inputCls}
              >
                <option value={1}>Yes</option>
                <option value={0}>No</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>Replaceable</label>
              <select
                name="isReplaceable"
                value={product.isReplaceable}
                disabled={product.isReturnable === 0}
                onChange={(e) =>
                  setProduct((prev) => ({
                    ...prev,
                    isReplaceable: Number(e.target.value) as 1 | 0,
                  }))
                }
                className={`${inputCls} disabled:bg-gray-100 disabled:cursor-not-allowed`}
              >
                <option value={1}>Yes</option>
                <option value={0}>No</option>
              </select>
            </div>

            {product.isReturnable === 1 && (
              <div>
                <label className={labelCls}>Return Window (Days)</label>
                <input
                  type="number"
                  name="returnWindowDays"
                  value={product.returnWindowDays}
                  onChange={handleFieldChange}
                  min={1}
                  max={30}
                  placeholder="e.g. 7"
                  className={inputCls}
                />
              </div>
            )}
          </div>
        </section>

        {/* ── LOGISTICS ── */}
        <section
          className="bg-white rounded-2xl p-6 sm:p-8 vendor-section-card"
          style={{
            border: "1px solid rgba(133,43,175,0.08)",
            boxShadow: "0 4px 24px rgba(133,43,175,0.06)",
          }}
        >
          <SectionHeader
            icon={FaBox}
            title="Logistics & Fulfilment"
            description="Delivery timelines and shipping classification"
          />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            <div>
              <label className={labelCls}>Delivery SLA (Min Days)</label>
              <input
                type="number"
                name="deliveryMinDays"
                value={product.deliveryMinDays}
                onChange={handleFieldChange}
                min={1}
                placeholder="e.g. 3"
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Delivery SLA (Max Days)</label>
              <input
                type="number"
                name="deliveryMaxDays"
                value={product.deliveryMaxDays}
                onChange={handleFieldChange}
                min={1}
                placeholder="e.g. 5"
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Shipping Class</label>
              <select
                name="shippingClass"
                value={product.shippingClass}
                onChange={handleFieldChange}
                className={inputCls}
              >
                <option value="standard">Standard</option>
                <option value="bulky">Bulky</option>
                <option value="fragile">Fragile</option>
              </select>
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-400">
            Delivery timeline shown to customers as an estimate. Actual delivery
            may vary by location.
          </p>
        </section>

        {/* ── COVER IMAGE ── */}
        <section
          className="bg-white rounded-2xl p-6 sm:p-8 vendor-section-card"
          style={{
            border: "1px solid rgba(133,43,175,0.08)",
            boxShadow: "0 4px 24px rgba(133,43,175,0.06)",
          }}
        >
          <SectionHeader
            icon={FaImages}
            title="Cover Image"
            description="Single cover image for product listing"
          />

          <div
            className="flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed"
            style={{
              borderColor: "rgba(133,43,175,0.2)",
              background: "rgba(133,43,175,0.02)",
            }}
          >
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">
                {product.productImages.length === 0
                  ? "No cover image chosen"
                  : "1 cover image selected"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                JPG, PNG, WEBP · High quality recommended
              </p>
            </div>

            <label
              className={`cursor-pointer px-4 py-2 text-xs font-semibold rounded-xl text-white transition-all active:scale-95 ${
                product.productImages.length >= 1
                  ? "opacity-40 cursor-not-allowed"
                  : "hover:opacity-90"
              }`}
              style={{
                background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
              }}
            >
              Choose Image
              <input
                type="file"
                hidden
                disabled={product.productImages.length >= 1}
                accept="image/*"
                onChange={handleMainImages}
              />
            </label>
          </div>

          {imageError && (
            <p className="mt-2 text-xs text-red-500">{imageError}</p>
          )}

          {product.productImages.length > 0 && (
            <div className="mt-4 flex gap-3 flex-wrap">
              {product.productImages.map((img, index) => (
                <div
                  key={index}
                  className="relative w-24 h-24 rounded-xl overflow-hidden border-2 group"
                  style={{ borderColor: "rgba(133,43,175,0.2)" }}
                >
                  <img
                    src={img.url}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => removeMainImage(index)}
                    className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition cursor-pointer hover:bg-red-600"
                  >
                    <FaTrash size={9} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── PRODUCT VIDEO ── */}
        <section
          className="bg-white rounded-2xl p-6 sm:p-8 vendor-section-card"
          style={{
            border: "1px solid rgba(133,43,175,0.08)",
            boxShadow: "0 4px 24px rgba(133,43,175,0.06)",
          }}
        >
          <SectionHeader
            icon={FaImages}
            title="Product Video"
            description="Upload one product demo video (optional)"
          />

          <div
            className="flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed"
            style={{
              borderColor: "rgba(133,43,175,0.2)",
              background: "rgba(133,43,175,0.02)",
            }}
          >
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">
                {product.productVideo
                  ? "1 video selected"
                  : "No product video chosen"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                MP4, WEBM, MOV · Max 50 MB
              </p>
            </div>

            <label
              className="cursor-pointer px-4 py-2 text-xs font-semibold rounded-xl text-white transition-all hover:opacity-90 active:scale-95"
              style={{
                background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
              }}
            >
              Choose Video
              <input
                type="file"
                hidden
                accept="video/mp4,video/webm,video/quicktime"
                onChange={handleProductVideo}
              />
            </label>
          </div>

          {videoError && (
            <p className="mt-2 text-xs text-red-500">{videoError}</p>
          )}

          {product.productVideo && (
            <div
              className="mt-4 relative w-64 rounded-xl overflow-hidden border-2 group"
              style={{ borderColor: "rgba(133,43,175,0.2)" }}
            >
              <video
                src={product.productVideo.url}
                controls
                className="w-full"
              />
              <button
                type="button"
                onClick={removeVideo}
                className="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition cursor-pointer hover:bg-red-600"
              >
                <FaTrash size={10} />
              </button>
            </div>
          )}
        </section>

        {/* ── DOCUMENTS ── */}
        {renderDocUploads()}

        {/* ── SUBMIT ── */}
        <div className="pt-2 pb-6">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center justify-center w-full px-6 py-4 text-base font-bold text-white rounded-2xl transition-all duration-300 cursor-pointer hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
              boxShadow: "0 8px 32px rgba(133,43,175,0.3)",
            }}
          >
            {isSubmitting ? (
              <>
                <FaSpinner className="mr-2 animate-spin" />
                Submitting Product…
              </>
            ) : (
              "Submit Product for Review"
            )}
          </button>
          <p className="text-center text-xs text-gray-400 mt-3">
            Your product will be reviewed before going live on the marketplace.
          </p>
        </div>
      </form>
    </div>
  );
}
