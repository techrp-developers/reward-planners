import React, { useState, useEffect } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { ComponentType } from "react";
import { useParams, useNavigate } from "react-router-dom";
import QuillEditor from "../components/QuillEditor";
import { FaArrowLeft } from "react-icons/fa";
// import imageCompression from "browser-image-compression";

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
    <div className="flex items-start space-x-3">
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
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
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
        className="w-full px-4 py-3 bg-gray-50/50 border border-gray-200 rounded-xl focus:ring-4 focus:ring-[#852BAF]/20 focus:border-[#852BAF] focus:bg-white transition-all outline-none text-sm text-gray-800 placeholder:text-gray-400"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
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
  FaLock,
} from "react-icons/fa";

// const API_BASE = import.meta.env.VITE_API_URL;
import { api } from "../../../common/api/api";
// const API_BASEIMAGE_URL = "https://rewardplanners.com/api/crm";
const R2_BASE_URL = "https://cdn.rewardplanners.com";

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
  existingImages?: string[];
  removedImages?: string[];
  existingVideo?: string | null;
  productVideo?: VideoPreview | null;
  removedVideo?: boolean;
  isDiscountEligible: 1 | 0;
  isReturnable: 1 | 0;
  isReplaceable: 1 | 0;
  returnWindowDays: string;

  deliveryMinDays: string;
  deliveryMaxDays: string;
  shippingClass: "standard" | "bulky" | "fragile";
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
  existingImages: [],
  removedImages: [],
  isDiscountEligible: 1,
  isReturnable: 1,
  isReplaceable: 1,
  returnWindowDays: "",

  deliveryMinDays: "1",
  deliveryMaxDays: "3",
  shippingClass: "standard",
};

// const allowOnlyAlphabets = (value: string) => /^[A-Za-z ]*$/.test(value);

export default function EditProductPage() {
  const { id: productId } = useParams<{ id: string }>();
  const navigate = useNavigate();

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
  const [custom_category, setCustomCategory] = useState("");
  const [custom_subcategory, setCustomSubCategory] = useState("");
  const [custom_subsubcategory, setCustomSubSubCategory] = useState("");
  const [categoryAttributes, setCategoryAttributes] = useState<any[]>([]);
  const [productAttributes, setProductAttributes] = useState<
    Record<string, any>
  >({});

  // --- Fetch data from API ---
  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await api.get("/category");

      if (res.data.success) {
        setCategories(res.data.data);
      }
    } catch (err) {
      console.error("Error fetching categories:", err);
      setError("Failed to load categories. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // const handleMainImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
  //   if (!e.target.files?.length) return;

  //   const file = e.target.files[0];

  //   if (!file.type.startsWith("image/")) {
  //     setImageError("Only image files are allowed.");
  //     return;
  //   }

  //   const existingCount = product.existingImages?.length || 0;
  //   const newCount = product.productImages.length;

  //   if (existingCount + newCount >= 1) {
  //     setImageError("Only one cover image is allowed.");
  //     return;
  //   }

  //   try {
  //     const compressedFile = await imageCompression(file, {
  //       maxSizeMB: 1,
  //       maxWidthOrHeight: 1920,
  //       useWebWorker: true,
  //       fileType: "image/webp",
  //       initialQuality: 0.85,
  //     });

  //     const preview = {
  //       file: compressedFile,
  //       url: URL.createObjectURL(compressedFile),
  //     };

  //     setProduct((prev) => ({
  //       ...prev,
  //       productImages: [preview],
  //     }));

  //     setImageError("");
  //   } catch (err) {
  //     console.error("Image compression failed:", err);
  //     setImageError("Image processing failed.");
  //   }

  //   e.target.value = "";
  // };

  const handleMainImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;

    const file = e.target.files[0];

    if (!file.type.startsWith("image/")) {
      setImageError("Only image files are allowed.");
      return;
    }

    const existingCount = product.existingImages?.length || 0;
    const newCount = product.productImages.length;

    if (existingCount + newCount >= 1) {
      setImageError("Only one cover image is allowed.");
      return;
    }

    const preview = {
      file: file, // original file
      url: URL.createObjectURL(file),
    };

    setProduct((prev) => ({
      ...prev,
      productImages: [preview],
    }));

    setImageError("");
    e.target.value = "";
  };

  const handleProductVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;

    const file = e.target.files[0];

    const preview = {
      file,
      url: URL.createObjectURL(file),
    };

    setProduct((prev) => ({
      ...prev,
      productVideo: preview,
      removedVideo: false,
    }));

    e.target.value = "";
  };

  const removeExistingVideo = () => {
    setProduct((prev) => ({
      ...prev,
      existingVideo: null,
      removedVideo: true,
    }));
  };

  const removeNewVideo = () => {
    if (product.productVideo) {
      URL.revokeObjectURL(product.productVideo.url);
    }

    setProduct((prev) => ({
      ...prev,
      productVideo: null,
    }));
  };

  const removeExistingMainImage = (img: string) => {
    setProduct((prev) => ({
      ...prev,
      existingImages: prev.existingImages?.filter((i) => i !== img),
      removedImages: [...(prev.removedImages || []), img],
    }));
  };

  const removeNewMainImage = (index: number) => {
    setProduct((prev) => {
      const imgs = [...prev.productImages];
      URL.revokeObjectURL(imgs[index].url);
      imgs.splice(index, 1);
      return { ...prev, productImages: imgs };
    });
  };

  const resolveCategoryLabel = () => {
    if (product.categoryId) return getSelectedCategoryName();
    if (custom_category) return custom_category;
    return "Not provided";
  };

  const resolveSubCategoryLabel = () => {
    if (product.subCategoryId) return getSelectedSubCategoryName();
    if (custom_subcategory) return custom_subcategory;
    return "Not provided";
  };

  const resolveSubSubCategoryLabel = () => {
    if (product.subSubCategoryId) return getSelectedSubSubCategoryName();
    if (custom_subsubcategory) return custom_subsubcategory;
    return "Not provided";
  };

  // Fetch subcategories when category changes
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

  // Fetch sub-subcategories when subcategory changes
  useEffect(() => {
    if (product.subCategoryId) {
      fetchSubSubCategories(product.subCategoryId);
    } else {
      setSubSubCategories([]);
      setProduct((prev) => ({ ...prev, subSubCategoryId: null }));
    }
  }, [product.subCategoryId]);

  const fetchSubCategories = async (categoryId: number) => {
    try {
      const res = await api.get(`/subcategory/${categoryId}`);

      if (res.data.success) {
        setSubCategories(res.data.data);
      }
    } catch (err) {
      console.error("Error fetching subcategories:", err);
    }
  };

  const fetchSubSubCategories = async (subcategoryId: number) => {
    try {
      const res = await api.get(`/subsubcategory/${subcategoryId}`);

      if (res.data.success) {
        setSubSubCategories(res.data.data);
      }
    } catch (err) {
      console.error("Error fetching sub-subcategories:", err);
    }
  };

  const fetchRequiredDocuments = async (categoryId: number) => {
    try {
      const res = await api.get(
        `/product/category/required_docs/${categoryId}`,
      );

      if (res.data.success) {
        setRequiredDocs(res.data.data || []);
        setDocFiles({});
      } else {
        setRequiredDocs([]);
      }
    } catch (err) {
      console.error("Error fetching category documents:", err);
      setRequiredDocs([]);
    }
  };

  const handleFieldChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;

    /* ===== PRODUCT TEXT (ALPHABETS ONLY) ===== */
    // const productAlphabetFields = ["brandName", "manufacturer"];

    // if (productAlphabetFields.includes(name)) {
    //   if (!allowOnlyAlphabets(value)) return;
    // }

    /* ===== CATEGORY LOGIC (UNCHANGED) ===== */
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

    /* ===== DEFAULT ===== */
    setProduct((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  useEffect(() => {
    if (!productId) return;
    fetchProductDetails(productId);
  }, [productId]);

  // character Limit
  const CHAR_LIMIT = 150;

  const handleShortDescriptionChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const value = e.target.value;

    if (value.length <= CHAR_LIMIT) {
      setProduct((prev) => ({
        ...prev,
        shortDescription: value,
      }));
    }
  };

  const loadAttributesForEdit = async (
    categoryId: number,
    subcategoryId: number,
    storedAttributes: any,
  ) => {
    try {
      const params = new URLSearchParams();
      params.append("categoryId", String(categoryId));
      params.append("subcategoryId", String(subcategoryId));

      const res = await api.get(`/category/attributes?${params.toString()}`);

      if (res.data.success) {
        const attrs = res.data.data;
        setCategoryAttributes(attrs);

        // parse stored JSON from DB
        let parsed: Record<string, any> = {};

        if (storedAttributes) {
          let raw =
            typeof storedAttributes === "string"
              ? JSON.parse(storedAttributes)
              : storedAttributes;

          // THE REAL FIX
          if (raw.attributes) {
            parsed =
              typeof raw.attributes === "string"
                ? JSON.parse(raw.attributes)
                : raw.attributes;
          } else {
            parsed = raw;
          }
        }

        // merge schema + stored data
        const merged: Record<string, any> = {};

        attrs.forEach((attr: any) => {
          merged[attr.attribute_key] = parsed[attr.attribute_key] || [];
        });

        setProductAttributes(merged);
      }
    } catch (err) {
      console.error("Failed to load attributes", err);
    }
  };

  const fetchProductDetails = async (id: string) => {
    try {
      setLoading(true);

      const res = await api.get(`/product/${id}`);
      const json = res.data;

      if (!json.success) {
        throw new Error(json.message || "Failed to fetch product");
      }

      const p = json.product;
      if (!p) throw new Error("Product not found");

      // Detect custom taxonomy
      const hasCustomCategory = !p.category_id && !!p.custom_category;
      const hasCustomSubcategory = !p.subcategory_id && !!p.custom_subcategory;
      const hasCustomSubSubcategory =
        !p.sub_subcategory_id && !!p.custom_sub_subcategory;

      // Set flags FIRST
      setIsCustomCategory(hasCustomCategory);
      setIsCustomSubcategory(hasCustomSubcategory);
      setIsCustomSubSubcategory(hasCustomSubSubcategory);

      // Set custom values
      setCustomCategory(p.custom_category || "");
      setCustomSubCategory(p.custom_subcategory || "");
      setCustomSubSubCategory(p.custom_sub_subcategory || "");

      // preload dropdowns
      if (p.category_id) {
        await fetchSubCategories(p.category_id);
        await fetchRequiredDocuments(p.category_id);
      }
      if (p.subcategory_id) {
        await fetchSubSubCategories(p.subcategory_id);
      }

      if (p.category_id && p.subcategory_id) {
        await loadAttributesForEdit(
          p.category_id,
          p.subcategory_id,
          p.attributes,
        );
      }

      setProduct({
        productName: p.product_name || "",
        brandName: p.brand_name || "",
        manufacturer: p.manufacturer || "",
        gstSlab: p.gst_slab || "",
        hsnSacCode: p.hsn_sac_code || "",
        description: p.description || "",
        shortDescription: p.short_description || "",
        brandDescription: p.brand_description || "",
        categoryId: p.category_id || null,
        subCategoryId: p.subcategory_id || null,
        subSubCategoryId: p.sub_subcategory_id || null,
        isDiscountEligible: p.is_discount_eligible ?? 1,
        isReturnable: p.is_returnable ?? 1,
        isReplaceable: p.is_replaceable ?? 1,
        returnWindowDays: p.return_window_days
          ? String(p.return_window_days)
          : "",

        deliveryMinDays: String(p.delivery_sla_min_days ?? 1),
        deliveryMaxDays: String(p.delivery_sla_max_days ?? 3),
        shippingClass: p.shipping_class ?? "standard",
        productImages: [],
        existingImages: p.images || [],
        existingVideo: p.video || null,
        productVideo: null,
        removedVideo: false,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onDocInputChange = (
    e: ChangeEvent<HTMLInputElement>,
    documentId: number,
  ) => {
    const file = e.target.files?.[0] ?? null;
    setDocFiles((prev) => ({ ...prev, [documentId]: file }));
  };

  const stripHtml = (html: string) => {
    return html.replace(/<[^>]*>/g, "").trim();
  };

  // --- Form Submission ---
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      /* ================= CATEGORY VALIDATION ================= */
      if (!product.categoryId && !custom_category.trim()) {
        throw new Error("Please select or enter a category");
      }

      /* ================= BASIC REQUIRED FIELDS ================= */
      if (!product.productName || !product.brandName || !product.manufacturer) {
        throw new Error("Please fill in all required product information");
      }

      /* ================= DESCRIPTION VALIDATION ================= */
      if (!stripHtml(product.description)) {
        throw new Error("Detailed description is required");
      }

      if (!stripHtml(product.brandDescription)) {
        throw new Error("Brand description is required");
      }

      if (!product.shortDescription.trim()) {
        throw new Error("Short description is required");
      }

      /* ================= ATTRIBUTE VALIDATION ================= */
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
        throw new Error(
          `Please fill required attributes: ${missingAttrs
            .map((a) => a.attribute_label)
            .join(", ")}`,
        );
      }

      /* ================= DELIVERY VALIDATION ================= */
      const minDays = Number(product.deliveryMinDays);
      const maxDays = Number(product.deliveryMaxDays);

      if (minDays <= 0 || maxDays <= 0) {
        throw new Error("Delivery days must be greater than 0");
      }

      if (minDays > maxDays) {
        throw new Error(
          "Minimum delivery days cannot exceed maximum delivery days",
        );
      }

      /* ================= RETURN WINDOW VALIDATION ================= */
      if (product.isReturnable === 1) {
        const days = Number(product.returnWindowDays);
        if (!days || days < 1 || days > 30) {
          throw new Error("Return window must be between 1 and 30 days");
        }
      }

      /* ================= COVER IMAGE VALIDATION ================= */
      const totalImages =
        (product.existingImages?.length || 0) + product.productImages.length;

      if (totalImages === 0) {
        throw new Error("Cover image is required");
      }

      /* ================= REQUIRED DOCUMENT VALIDATION ================= */
      for (const doc of requiredDocs) {
        if (doc.status === 1 && !docFiles[doc.document_id]) {
          throw new Error(
            `Please upload required document: ${doc.document_name}`,
          );
        }
      }

      /* ================= BUILD FORM DATA ================= */
      const formData = new FormData();

      if (product.categoryId) {
        formData.append("category_id", product.categoryId.toString());
      }

      if (product.subCategoryId) {
        formData.append("subcategory_id", product.subCategoryId.toString());
      }

      if (product.subSubCategoryId) {
        formData.append(
          "sub_subcategory_id",
          product.subSubCategoryId.toString(),
        );
      }

      if (isCustomCategory) {
        formData.append("custom_category", custom_category.trim());
      }

      if (isCustomSubcategory) {
        formData.append("custom_subcategory", custom_subcategory.trim());
      }

      if (isCustomSubSubcategory) {
        formData.append("custom_sub_subcategory", custom_subsubcategory.trim());
      }

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

      if (product.isReturnable === 1) {
        formData.append("return_window_days", product.returnWindowDays);
      }

      formData.append("delivery_sla_min_days", product.deliveryMinDays);
      formData.append("delivery_sla_max_days", product.deliveryMaxDays);
      formData.append("shipping_class", product.shippingClass);

      product.productImages.forEach(({ file }) => {
        formData.append("images", file);
      });

      formData.append(
        "removedMainImages",
        JSON.stringify(product.removedImages || []),
      );

      if (product.productVideo) {
        formData.append("video", product.productVideo.file);
      }

      formData.append(
        "removedVideo",
        JSON.stringify(product.removedVideo || false),
      );

      Object.entries(docFiles).forEach(([docId, file]) => {
        if (file) formData.append(docId, file);
      });

      formData.append("attributes", JSON.stringify(productAttributes));

      /* ================= SUBMIT ================= */
      const response = await api.put(
        `/product/update-product/${productId}`,
        formData,
      );

      if (!response.data.success) {
        throw new Error(response.data.message || "Failed to update product");
      }

      setSuccess(`Product updated successfully! Product ID: ${productId}`);
      navigate("/vendor/products/list");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Render Components ---
  const renderDocUploads = () => {
    if (requiredDocs.length === 0) return null;

    return (
      <section>
        <SectionHeader
          icon={FaFileUpload}
          title="Required Documents"
          description="Upload documents required by category"
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {requiredDocs.map((doc) => (
            <div
              key={doc.document_id}
              className="p-4 bg-white border rounded-lg shadow-sm"
            >
              <label className="block mb-2 text-sm font-medium text-gray-700">
                {doc.document_name}{" "}
                {doc.status === 1 && <span className="text-red-500">*</span>}
                {doc.status === 1 && (
                  <span className="ml-2 text-xs text-gray-500">(Required)</span>
                )}
                {doc.status !== 1 && (
                  <span className="ml-2 text-xs text-gray-500">(Optional)</span>
                )}
              </label>
              <input
                type="file"
                accept=".pdf,image/*,.doc,.docx,.png,.jpg,.jpeg"
                onChange={(e) => onDocInputChange(e, doc.document_id)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#852BAF] file:text-white"
              />
              <div className="mt-2 text-xs text-gray-500">
                Accepted: PDF, DOC, DOCX, JPG, PNG
              </div>
              {docFiles[doc.document_id] && (
                <div className="mt-1 text-xs text-green-600">
                  ✓ {docFiles[doc.document_id]?.name}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    );
  };

  // Get selected category name
  const getSelectedCategoryName = () => {
    const category = categories.find(
      (c) => c.category_id === product.categoryId,
    );
    return category?.category_name || "Not selected";
  };

  // Get selected subcategory name
  const getSelectedSubCategoryName = () => {
    const subcategory = subCategories.find(
      (s) => s.subcategory_id === product.subCategoryId,
    );
    return subcategory?.subcategory_name || "Not selected";
  };

  // Get selected sub-subcategory name
  const getSelectedSubSubCategoryName = () => {
    const subsubcategory = subSubCategories.find(
      (ss) => ss.sub_subcategory_id === product.subSubCategoryId,
    );
    return subsubcategory?.name || "Not selected";
  };

  if (loading && categories.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <FaSpinner className="animate-spin text-4xl text-[#852BAF]" />
        <span className="ml-4 text-gray-600">Loading categories...</span>
      </div>
    );
  }

  const coverImage = product.existingImages?.[0];

  return (
    <div className="p-6 premium-form" style={{ backgroundColor: "#FFFAFB" }}>
      <div className="p-6 mx-auto bg-white border border-gray-100 shadow-xl rounded-2xl max-w-7xl">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="mb-1 text-3xl font-bold text-gray-900">
              Edit Product Details
            </h1>
            <p className="text-sm text-gray-600">
              Editing product ID: {productId}
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg
      bg-[#852BAF] text-white transition-all duration-300
      hover:bg-linear-to-r hover:from-[#852BAF] hover:to-[#FC3F78]
      cursor-pointer"
          >
            <FaArrowLeft /> Back
          </button>
        </div>

        {error && (
          <div className="p-4 mb-6 border border-red-200 rounded-lg bg-red-50">
            <p className="font-medium text-red-700">Error: {error}</p>
          </div>
        )}

        {success && (
          <div className="p-4 mb-6 border border-green-200 rounded-lg bg-green-50">
            <p className="font-medium text-green-700">{success}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Category Selection */}
          <section>
            <SectionHeader
              icon={FaTag}
              title="Category Selection"
              description="Choose category, sub-category and type"
            />

            {/* DISABLED WRAPPER */}
            <div
              className="relative opacity-60 pointer-events-none
               bg-gray-50 border border-gray-200 rounded-xl p-4"
            >
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {/* Category */}
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">
                    Category <span className="text-red-500">*</span>
                  </label>

                  <select className="w-full p-3 border rounded-lg bg-gray-100 text-gray-600">
                    <option>{resolveCategoryLabel()}</option>
                  </select>
                </div>

                {/* Sub Category */}
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">
                    Sub Category
                  </label>

                  <select className="w-full p-3 border rounded-lg bg-gray-100 text-gray-600">
                    <option>{resolveSubCategoryLabel()}</option>
                  </select>
                </div>

                {/* Sub Sub Category */}
                <div>
                  <label className="block mb-2 text-sm font-medium text-gray-700">
                    Type / Sub-type
                  </label>

                  <select className="w-full p-3 border rounded-lg bg-gray-100 text-gray-600">
                    <option>{resolveSubSubCategoryLabel()}</option>
                  </select>
                </div>
              </div>

              {/* Selected Categories Display */}
              {(resolveCategoryLabel() !== "Not provided" ||
                resolveSubCategoryLabel() !== "Not provided" ||
                resolveSubSubCategoryLabel() !== "Not provided") && (
                <div className="p-3 mt-4 border rounded-lg bg-gray-100">
                  <h4 className="mb-2 font-medium text-gray-700">
                    Selected Categories:
                  </h4>

                  <div className="flex items-center text-sm text-gray-600">
                    <span className="font-medium">
                      {resolveCategoryLabel()}
                    </span>

                    {resolveSubCategoryLabel() !== "Not provided" && (
                      <>
                        <span className="mx-2">›</span>
                        <span>{resolveSubCategoryLabel()}</span>
                      </>
                    )}

                    {resolveSubSubCategoryLabel() !== "Not provided" && (
                      <>
                        <span className="mx-2">›</span>
                        <span>{resolveSubSubCategoryLabel()}</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* LOCK BADGE */}
              <div className="absolute top-3 right-3 text-xs text-gray-500 flex items-center gap-1">
                <FaLock className="text-gray-400" size={12} />
                <span>Category locked</span>
              </div>
            </div>

            {/* Helper text */}
            <p className="mt-2 text-xs text-gray-500">
              Category selection cannot be changed after product creation.
            </p>
          </section>

          {/* Product Identification */}
          <section>
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
                onChange={handleFieldChange}
                required
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

          {/* Product Attributes */}
          <section>
            <SectionHeader
              icon={FaBox}
              title="Product Attributes"
              description="Select available options for this product"
            />

            {/* Product Attributes */}
            {!isCustomCategory && categoryAttributes.length > 0 && (
              <div className="mt-8">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {categoryAttributes.map((attr) => {
                    const inputType = attr.input_type?.trim().toLowerCase();

                    return (
                      <div key={attr.attribute_key}>
                        <label className="block mb-1 text-sm font-medium text-gray-700">
                          {attr.attribute_label}
                          {attr.is_required === 1 && (
                            <span className="text-red-500">*</span>
                          )}
                        </label>

                        {/* MULTISELECT */}
                        {inputType === "multiselect" && (
                          <div className="flex flex-wrap gap-2">
                            {(attr.options || []).map((opt: string) => {
                              const selected = (
                                productAttributes[attr.attribute_key] || []
                              ).includes(opt);
                              return (
                                <label
                                  key={opt}
                                  className="flex items-center gap-2"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={(e) => {
                                      const prevVals =
                                        productAttributes[attr.attribute_key] ||
                                        [];

                                      const newVals = e.target.checked
                                        ? [...prevVals, opt]
                                        : prevVals.filter(
                                            (v: string) => v !== opt,
                                          );

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

                        {/* SELECT */}
                        {inputType === "select" && (
                          <select
                            required={attr.is_required === 1}
                            value={
                              (productAttributes[attr.attribute_key] ||
                                [])[0] || ""
                            }
                            onChange={(e) =>
                              setProductAttributes((prev) => ({
                                ...prev,
                                [attr.attribute_key]: [e.target.value],
                              }))
                            }
                            className="w-full p-2 border rounded-lg"
                          >
                            <option value="">
                              Select {attr.attribute_label}
                            </option>

                            {(attr.options || []).map((opt: string) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        )}

                        {/* NUMBER */}
                        {inputType === "number" && (
                          <input
                            type="number"
                            required={attr.is_required === 1}
                            value={
                              (productAttributes[attr.attribute_key] ||
                                [])[0] || ""
                            }
                            onChange={(e) =>
                              setProductAttributes((prev) => ({
                                ...prev,
                                [attr.attribute_key]: [e.target.value],
                              }))
                            }
                            className="w-full p-2 border rounded-lg"
                          />
                        )}

                        {/* TEXT */}
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
                            className="w-full p-2 border rounded-lg"
                          />
                        )}

                        {/* TEXTAREA */}
                        {inputType === "textarea" && (
                          <textarea
                            required={attr.is_required === 1}
                            value={
                              (productAttributes[attr.attribute_key] ||
                                [])[0] || ""
                            }
                            onChange={(e) =>
                              setProductAttributes((prev) => ({
                                ...prev,
                                [attr.attribute_key]: [e.target.value],
                              }))
                            }
                            className="w-full p-2 border rounded-lg"
                            rows={3}
                            placeholder={attr.attribute_label}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Product Description */}
          <section>
            <SectionHeader
              icon={FaBox}
              title="Product Description"
              description="Describe the product in detail and add a short summary"
            />
            <div className="mt-4 p-6 bg-white border border-gray-200 rounded-2xl shadow-sm">
              {/* ===================== DETAILED DESCRIPTION ===================== */}
              <div>
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  Detailed Description <span className="text-red-500">*</span>
                </label>

                <QuillEditor
                  value={product.description}
                  placeholder="Describe the product, features, usage, specifications, etc."
                  minHeight={300}
                  onChange={(val) =>
                    setProduct((prev) => ({
                      ...prev,
                      description: val,
                    }))
                  }
                />
              </div>

              {/* ===================== BRAND DESCRIPTION ===================== */}
              <div className="mt-8">
                <label className="block mb-2 text-sm font-medium text-gray-700">
                  Brand Description <span className="text-red-500">*</span>
                </label>

                <QuillEditor
                  value={product.brandDescription}
                  placeholder="Describe the brand story, quality, values and background..."
                  minHeight={260}
                  onChange={(val) =>
                    setProduct((prev) => ({
                      ...prev,
                      brandDescription: val,
                    }))
                  }
                />
              </div>

              {/* ===================== SHORT DESCRIPTION ===================== */}
              <div className="mt-6">
                <FormInput
                  id="shortDescription"
                  label="Short Description"
                  type="textarea"
                  required
                  value={product.shortDescription}
                  onChange={handleShortDescriptionChange}
                  placeholder="Short description (max 150 characters)"
                />

                <p
                  className={`mt-1 text-xs ${
                    product.shortDescription.length >= CHAR_LIMIT
                      ? "text-red-500"
                      : "text-gray-500"
                  }`}
                >
                  {product.shortDescription.length} / {CHAR_LIMIT} characters
                </p>
              </div>
            </div>
          </section>

          {/* Return and Discount */}
          <section>
            <SectionHeader
              icon={FaTag}
              title="Pricing & Commercial Controls"
              description="Discount eligibility and return policy"
            />

            <div className="mt-4 p-6 bg-white border border-gray-200 rounded-2xl shadow-sm">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                {/* Discount Eligible */}
                <div>
                  <label className="block mb-1 text-sm font-medium text-gray-700">
                    Discount Eligible
                  </label>
                  <select
                    name="isDiscountEligible"
                    value={product.isDiscountEligible}
                    onChange={(e) =>
                      setProduct((prev) => ({
                        ...prev,
                        isDiscountEligible: Number(e.target.value) as 1 | 0,
                      }))
                    }
                    className="w-full p-3 border rounded-lg"
                  >
                    <option value={1}>Yes</option>
                    <option value={0}>No</option>
                  </select>
                </div>

                {/* Returnable */}
                <div>
                  <label className="block mb-1 text-sm font-medium text-gray-700">
                    Returnable
                  </label>
                  <select
                    name="isReturnable"
                    value={product.isReturnable}
                    onChange={(e) => {
                      const val = Number(e.target.value) as 1 | 0;
                      setProduct((prev) => ({
                        ...prev,
                        isReturnable: val,
                        isReplaceable: val === 0 ? 0 : prev.isReplaceable,
                        returnWindowDays:
                          val === 0 ? "" : prev.returnWindowDays,
                      }));
                    }}
                    className="w-full p-3 border rounded-lg"
                  >
                    <option value={1}>Yes</option>
                    <option value={0}>No</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1 text-sm font-medium text-gray-700">
                    Replaceable
                  </label>

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
                    className="w-full p-3 border rounded-lg disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value={1}>Yes</option>
                    <option value={0}>No</option>
                  </select>
                </div>

                {/* Return Window */}
                {product.isReturnable === 1 && (
                  <FormInput
                    id="returnWindowDays"
                    label="Return Window (Days)"
                    type="number"
                    value={product.returnWindowDays}
                    onChange={handleFieldChange}
                    placeholder="e.g. 7"
                  />
                )}
              </div>
            </div>
          </section>

          {/* Logistic */}
          <section>
            <SectionHeader
              icon={FaBox}
              title="Logistics & Fulfilment"
              description="Delivery timeline and shipping classification"
            />

            <div className="mt-4 p-6 bg-white border border-gray-200 rounded-2xl shadow-sm">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <FormInput
                  id="deliveryMinDays"
                  label="Delivery SLA (Min Days)"
                  type="number"
                  value={product.deliveryMinDays}
                  onChange={handleFieldChange}
                />

                <FormInput
                  id="deliveryMaxDays"
                  label="Delivery SLA (Max Days)"
                  type="number"
                  value={product.deliveryMaxDays}
                  onChange={handleFieldChange}
                />

                {/* Shipping Class DROPDOWN */}
                <div>
                  <label className="block mb-1 text-sm font-medium text-gray-700">
                    Shipping Class
                  </label>
                  <select
                    name="shippingClass"
                    value={product.shippingClass}
                    onChange={handleFieldChange}
                    className="w-full p-3 border rounded-lg"
                  >
                    <option value="standard">Standard</option>
                    <option value="bulky">Bulky</option>
                    <option value="fragile">Fragile</option>
                  </select>
                </div>
              </div>

              <p className="mt-3 text-xs text-gray-500">
                Delivery timeline shown to customers as an estimate. Actual
                delivery may vary by location.
              </p>
            </div>
          </section>

          {/* Main Product Images */}
          <section>
            <SectionHeader
              icon={FaImages}
              title="Cover Image"
              description="Single cover image for product listing"
            />

            {coverImage && (
              <div className="mb-3">
                <div className="relative w-32 h-32 group">
                  <img
                    src={`${R2_BASE_URL}/${coverImage}`}
                    className="w-full h-full object-cover border rounded"
                    alt="Cover Image"
                  />

                  <button
                    type="button"
                    onClick={() => removeExistingMainImage(coverImage)}
                    className="absolute top-1 right-1 bg-black/70 text-white p-1 rounded-full
        opacity-0 group-hover:opacity-100 transition cursor-pointer"
                  >
                    <FaTrash size={12} />
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center p-3 bg-white border border-gray-400 border-dashed rounded-lg">
              <span className="flex-1 text-sm text-gray-600">
                {product.productImages.length === 0 &&
                product.existingImages?.length === 0
                  ? "No cover image chosen"
                  : "1 cover image selected"}
              </span>
              <label className="cursor-pointer bg-[#852BAF] text-white px-3 py-1 text-xs rounded-full hover:bg-[#7a1c94]">
                Choose Files
                <input
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*"
                  disabled={
                    (product.existingImages?.length || 0) +
                      product.productImages.length >=
                    1
                  }
                  onChange={handleMainImages}
                />
              </label>
            </div>

            <p className="mt-2 text-xs text-gray-500">
              Upload one cover image (required)
            </p>

            {imageError && (
              <p className="mt-1 text-xs text-red-500">{imageError}</p>
            )}

            {/* Image Previews */}
            {product.productImages.length > 0 && (
              <div className="mt-3 flex gap-2 flex-wrap">
                {product.productImages.length > 0 && (
                  <div className="mt-3">
                    <div className="relative w-32 h-32 group">
                      <img
                        src={product.productImages[0].url}
                        alt="Cover Preview"
                        className="w-full h-full object-cover border rounded"
                      />

                      <button
                        type="button"
                        onClick={() => removeNewMainImage(0)}
                        className="absolute top-1 right-1 bg-black/70 text-white p-1 rounded-full
        opacity-0 group-hover:opacity-100 transition cursor-pointer"
                      >
                        <FaTrash size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Product Video */}
          <section>
            <SectionHeader
              icon={FaImages}
              title="Product Video"
              description="Upload or replace product demo video"
            />

            {/* Existing video */}
            {product.existingVideo && !product.productVideo && (
              <div className="mb-3">
                <div className="relative w-72 group border rounded overflow-hidden">
                  <video
                    src={`${R2_BASE_URL}/${product.existingVideo}`}
                    controls
                    className="w-full h-full"
                  />
                  <button
                    type="button"
                    onClick={removeExistingVideo}
                    className="absolute top-1 right-1 bg-black/70 text-white p-1 rounded-full
          opacity-0 group-hover:opacity-100 transition cursor-pointer"
                  >
                    <FaTrash size={12} />
                  </button>
                </div>
              </div>
            )}

            {/* Upload new video */}
            <div className="flex items-center p-3 bg-white border border-gray-400 border-dashed rounded-lg">
              <span className="flex-1 text-sm text-gray-600">
                {product.productVideo
                  ? "New video selected"
                  : product.existingVideo
                    ? "Existing video present"
                    : "No video chosen"}
              </span>

              <label className="cursor-pointer bg-[#852BAF] text-white px-3 py-1 text-xs rounded-full hover:bg-[#7a1c94]">
                Choose Video
                <input
                  type="file"
                  hidden
                  accept="video/mp4,video/webm,video/quicktime"
                  onChange={handleProductVideo}
                />
              </label>
            </div>

            {/* New video preview */}
            {product.productVideo && (
              <div className="mt-3">
                <div className="relative w-72 group border rounded overflow-hidden">
                  <video
                    src={product.productVideo.url}
                    controls
                    className="w-full h-full"
                  />
                  <button
                    type="button"
                    onClick={removeNewVideo}
                    className="absolute top-1 right-1 bg-black/70 text-white p-1 rounded-full
          opacity-0 group-hover:opacity-100 transition cursor-pointer"
                  >
                    <FaTrash size={12} />
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Documents */}
          {renderDocUploads()}

          {/* Submit Button */}
          <div className="pt-6">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center justify-center w-full px-6 py-3 text-lg font-bold text-white rounded-full transition-all duration-300 cursor-pointer hover:opacity-90 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
                boxShadow: "0 8px 24px rgba(133,43,175,0.3)",
              }}
            >
              {isSubmitting ? (
                <>
                  <FaSpinner className="mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Product"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
