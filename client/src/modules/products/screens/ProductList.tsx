import React, { useEffect, useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import {
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaEye,
  FaFileAlt,
  FaSpinner,
  FaFilter,
  FaSearch,
  FaQuestionCircle,
  FaEdit,
  FaRedo,
  FaCheck,
  FaTimes,
  FaBox,
  FaPaperPlane,
  FaCogs,
  FaTrash,
  FaUpload,
  // FaFileImport,
} from "react-icons/fa";
import { FiPackage } from "react-icons/fi";
import Swal from "sweetalert2";
import { Link } from "react-router-dom";
import { routes } from "../../../routes";
import { api } from "../../../common/api/api";

// const API_BASEIMAGE_URL = "https://rewardplanners.com/api/crm";
const R2_BASE_URL = "https://cdn.rewardplanners.com";

/* ================================
       TYPES
================================ */
type ProductStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "resubmission"
  | "sent_for_approval";

interface ProductDocument {
  document_id: number;
  document_name: string;
  document_url: string;
  uploaded_at: string;
}

interface ProductItem {
  product_id: number;
  vendor_id: number;
  company_name: string;
  vendor_name: string;
  vendor_email: string;
  product_name: string;
  brand_name: string;
  sale_price: number;
  vendor_price: number;
  stock: number;
  status: ProductStatus;
  rejection_reason: string | null;
  is_visible: boolean;
  is_searchable: boolean;
  created_at: string;
  updated_at: string;
  main_image: string | null;
  category_name: string;
  subcategory_name: string;
  sub_subcategory_name: string | null;
  custom_category: string;
  custom_subcategory: string;
  custom_sub_subcategory: string | null;
  sku: string;
  barcode: string;
  documents?: ProductDocument[];
}

interface Stats {
  pending: number;
  approved: number;
  rejected: number;
  resubmission: number;
  sent_for_approval: number;
  total: number;
}

interface ApiResponse {
  success: boolean;
  products: ProductItem[];
  total: number;
  page: number;
  totalPages: number;
  stats: Stats;
}

interface StatsCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  active?: boolean;
  onClick?: () => void;
}

interface Category {
  category_id: number;
  category_name: string;
  variant_type?: string;
}

interface Subcategory {
  subcategory_id: number;
  category_id: number;
  subcategory_name: string;
}

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  categoryId: string;
  setCategoryId: (val: string) => void;
  subcategoryId: string;
  setSubcategoryId: (val: string) => void;
  onFileUpload: (file: File) => void;
}

const StatsCard = ({
  label,
  value,
  icon: Icon,
  color,
  active,
  onClick,
}: StatsCardProps) => {
  return (
    <div
      onClick={onClick}
      className={`
        relative overflow-hidden rounded-2xl p-5 cursor-pointer
        text-white bg-linear-to-br ${color}
        transition-all duration-300 stats-card-enter
        ${
          active
            ? "ring-2 ring-white/60 scale-[1.04] shadow-2xl"
            : "shadow-lg hover:scale-[1.02] hover:shadow-xl"
        }
      `}
    >
      {/* Decorative circles */}
      <div className="absolute w-24 h-24 rounded-full -top-6 -right-6 bg-white/10" />
      <div className="absolute w-20 h-20 rounded-full -bottom-8 -left-4 bg-white/10" />

      {/* Active indicator bar */}
      {active && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-white/40 rounded-t-2xl" />
      )}

      {/* CONTENT */}
      <div className="relative z-10 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase opacity-80">
            {label}
          </p>
          <p className="mt-2 text-3xl font-black leading-none stat-value-pop">
            {value}
          </p>
        </div>

        <div className={`p-3 rounded-2xl ${active ? "bg-white/30" : "bg-white/20"}`}>
          <Icon className="text-xl" />
        </div>
      </div>
    </div>
  );
};

type ActionType = "approve" | "reject" | "request_resubmission" | "delete";

/* ================================
       STATUS CHIP
================================ */
const StatusChip = ({ status }: { status: ProductStatus }) => {
  const configMap: Record<
    ProductStatus,
    {
      color: string;
      icon: React.ComponentType<{ size?: number }>;
      text: string;
    }
  > = {
    approved: {
      color: "bg-green-100 text-green-800 border-green-200",
      icon: FaCheckCircle,
      text: "Approved",
    },
    rejected: {
      color: "bg-red-100 text-red-800 border-red-200",
      icon: FaTimesCircle,
      text: "Rejected",
    },
    resubmission: {
      color: "bg-blue-100 text-blue-800 border-blue-200",
      icon: FaRedo,
      text: "Resubmission",
    },
    pending: {
      color: "bg-yellow-100 text-yellow-800 border-yellow-200",
      icon: FaClock,
      text: "Pending",
    },
    sent_for_approval: {
      color: "bg-blue-100 text-blue-800 border-blue-200",
      icon: FaPaperPlane,
      text: "Sent for Approval",
    },
  };

  const cfg = configMap[status] ?? {
    color: "bg-gray-200 text-gray-700 border-gray-300",
    icon: FaQuestionCircle,
    text: status || "Unknown",
  };

  const Icon = cfg.icon;

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${cfg.color}`}
    >
      <Icon size={12} />
      {cfg.text}
    </div>
  );
};

/* ================================
       ACTION MODAL
================================ */
interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (action: ActionType, reason?: string) => Promise<void>;
  product: ProductItem | null;
  actionType: ActionType;
}

const ActionModal = ({
  isOpen,
  onClose,
  onSubmit,
  product,
  actionType,
}: ActionModalProps) => {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) setReason("");
  }, [isOpen]);

  if (!isOpen || !product) return null;

  const config = {
    approve: {
      title: "Approve Product",
      description: `Approve "${product.product_name}"?`,
      buttonText: "Approve",
      buttonColor: "bg-green-600 hover:bg-green-700",
      iconBg: "bg-green-100",
      iconColor: "text-green-600",
      Icon: FaCheck,
      showReason: false,
      placeholder: "",
    },
    reject: {
      title: "Reject Product",
      description: `Reject "${product.product_name}"?`,
      buttonText: "Reject",
      buttonColor: "bg-red-600 hover:bg-red-700",
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
      Icon: FaTimes,
      showReason: true,
      placeholder: "Provide rejection reason...",
    },
    request_resubmission: {
      title: "Send for Approval",
      description: `Are you sure you want to send "${product.product_name}" for approval?`,
      buttonText: "Send",
      buttonColor: "bg-blue-600 hover:bg-blue-700",
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
      Icon: FaPaperPlane,
      showReason: false,
      placeholder: "",
    },
    delete: {
      title: "Delete Product",
      description: `Are you sure you want to delete "${product.product_name}"?`,
      buttonText: "Delete",
      buttonColor: "bg-red-600 hover:bg-red-700",
      iconBg: "bg-red-100",
      iconColor: "text-red-600",
      Icon: FaTrash,
      showReason: false,
      placeholder: "",
    },
  }[actionType];

  const handleSubmit = async () => {
    if (config.showReason && !reason.trim()) {
      Swal.fire({
        icon: "warning",
        title: "Reason Required",
        text: "Please provide a reason.",
      });
      return;
    }

    setLoading(true);
    try {
      await onSubmit(actionType, config.showReason ? reason : undefined);

      Swal.fire({
        icon: "success",
        title: "Success",
        text: "Action completed successfully!",
        timer: 2000,
        showConfirmButton: false,
      });

      onClose();
    } catch (err) {
      console.error("Action failed:", err);

      Swal.fire({
        icon: "error",
        title: "Failed",
        text: "Something went wrong. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
       style={{ background: "rgba(2, 6, 23, 0.45)" }}
    >
      <div className="w-full max-w-md p-6 bg-white shadow-xl rounded-2xl">
        <div className="flex items-center mb-4">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${config.iconBg}`}
          >
            <config.Icon className={config.iconColor} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {config.title}
            </h3>
            <p className="text-sm text-gray-600">{config.description}</p>
          </div>
        </div>

        {config.showReason && (
          <div className="mb-6">
            <label className="block mb-2 text-sm font-medium text-gray-700">
              Reason / Comments *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={config.placeholder}
              rows={4}
              className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-[#852BAF] focus:border-transparent"
            />
          </div>
        )}

        <div className="flex justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className={`px-4 py-2 text-white rounded-lg ${config.buttonColor} disabled:opacity-50 flex items-center cursor-pointer`}
          >
            {loading ? (
              <>
                <FaSpinner className="mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              config.buttonText
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const BulkUploadModal = ({
  isOpen,
  onClose,
  categoryId,
  setCategoryId,
  subcategoryId,
  setSubcategoryId,
  onFileUpload,
}: BulkUploadModalProps) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);

  const [file, setFile] = useState<File | null>(null);

  // const [loading, setLoading] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);

  /* ================================
        FETCH CATEGORIES
  ================================= */
  useEffect(() => {
    if (!isOpen) return;

    const fetchCategories = async () => {
      try {
        const res = await api.get("/category");
        if (res.data.success) setCategories(res.data?.data);
      } catch (err) {
        console.error("Failed to fetch categories", err);
      }
    };

    fetchCategories();
  }, [isOpen]);

  /* ================================
        FETCH SUBCATEGORIES
  ================================= */
  useEffect(() => {
    if (!categoryId) {
      setSubcategories([]);
      return;
    }

    const fetchSubcategories = async () => {
      try {
        const res = await api.get(`/subcategory/${categoryId}`);
        if (res.data.success) setSubcategories(res.data.data);
      } catch (err) {
        console.error("Failed to fetch subcategories", err);
      }
    };

    fetchSubcategories();
  }, [categoryId]);

  /* ================================
        RESET ON CLOSE
  ================================= */
  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setSubcategories([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  /* ================================
        DOWNLOAD TEMPLATE
  ================================= */
  const handleDownloadTemplate = async () => {
    if (!categoryId || !subcategoryId) {
      Swal.fire({
        icon: "warning",
        title: "Select Required Fields",
        text: "Please select category and subcategory first",
      });
      return;
    }

    try {
      setTemplateLoading(true);

      const res = await api.get(
        `/category/attributes-template?categoryId=${categoryId}&subcategoryId=${subcategoryId}`,
        { responseType: "blob" },
      );

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "product_template.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Failed to download template", "error");
    } finally {
      setTemplateLoading(false);
    }
  };

  /* ================================
        RENDER
  ================================= */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-black/40">
      <div className="w-full max-w-xl p-6 bg-white shadow-xl rounded-2xl">
        {/* HEADER */}
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-gray-900">
            Bulk Upload Products
          </h2>
          <p className="text-sm text-gray-500">
            Download template, fill it, and upload here
          </p>

          <div className="p-3 mt-3 text-sm text-yellow-800 border border-yellow-200 rounded-lg bg-yellow-50">
            <p className="mb-1 font-semibold">⚠️ Instructions:</p>
            <ul className="pl-5 space-y-1 list-disc">
              <li>Do not modify first 3 rows</li>
              <li>Start entering data from row 4</li>
              <li>Use comma (,) for multiple values</li>
              <li>Follow options exactly</li>
            </ul>
          </div>
        </div>

        {/* CATEGORY + TEMPLATE */}
        <div className="grid grid-cols-1 gap-3 mb-5 md:grid-cols-3">
          <select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setSubcategoryId("");
            }}
            className="border p-3 rounded-lg outline-none focus:ring-2 focus:ring-[#852BAF] cursor-pointer"
          >
            <option value="">Select Category</option>
            {categories.map((c) => (
              <option key={c.category_id} value={c.category_id}>
                {c.category_name}
              </option>
            ))}
          </select>

          <select
            value={subcategoryId}
            onChange={(e) => setSubcategoryId(e.target.value)}
            className="border p-3 rounded-lg outline-none focus:ring-2 focus:ring-[#852BAF] cursor-pointer"
            disabled={!categoryId}
          >
            <option value="">Select Subcategory</option>
            {subcategories.map((s) => (
              <option key={s.subcategory_id} value={s.subcategory_id}>
                {s.subcategory_name}
              </option>
            ))}
          </select>

          <button
            onClick={handleDownloadTemplate}
            disabled={!categoryId || !subcategoryId || templateLoading}
            className="flex items-center justify-center px-4 py-2 text-white bg-indigo-600 rounded-lg cursor-pointer hover:bg-indigo-700 disabled:opacity-50"
          >
            {templateLoading ? "Downloading..." : "Download"}
          </button>
        </div>

        {/* FILE UPLOAD */}
        <div className="p-6 mb-5 text-center border-2 border-gray-300 border-dashed rounded-lg">
          <input
            type="file"
            disabled={!categoryId || !subcategoryId}
            accept=".xlsx,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;

              setFile(f);
              onFileUpload(f);
            }}
          />

          {file && (
            <p className="mt-2 text-sm font-medium text-gray-700">
              {file.name}
            </p>
          )}

          <p className="mt-2 text-xs text-gray-500">
            Supported formats: Excel (.xlsx) or CSV
          </p>
        </div>

        {/* ACTIONS */}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            // disabled={loading}
            className="px-4 py-2 text-gray-700 border rounded-lg cursor-pointer hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

/* ================================
       MAIN COMPONENT
================================ */
export default function ProductManagerList() {
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [brandInput, setBrandInput] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [sortBy, setSortBy] = useState<string>("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  // const [rows, setRows] = useState<any[]>([]);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [validating, setValidating] = useState(false);

  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 10,
  });

  const [stats, setStats] = useState<Stats>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    resubmission: 0,
    sent_for_approval: 0,
  });

  const debounceRef = useRef<number | null>(null);
  const brandDebounceRef = useRef<number | null>(null);

  // Modal state
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    product: ProductItem | null;
    actionType: ActionType;
  }>({
    isOpen: false,
    product: null,
    actionType: "approve",
  });

  // =========================
  // BULK UPLOAD
  // ===============================
  const validateBulk = async (rowsData: any[]) => {
    if (!rowsData.length) return;

    if (!categoryId || !subcategoryId) {
      Swal.fire("Error", "Select category & subcategory first", "error");
      return;
    }

    try {
      setValidating(true);

      const res = await api.post("/product/validate-bulk-upload", {
        categoryId,
        subcategoryId,
        rows: rowsData,
      });

      const data = res.data;

      setValidationResult(data);

      Swal.fire({
        icon: "success",
        title: "File Processed",
        text: `${data.validCount} valid rows ready to upload`,
      });
    } catch (err: any) {
      console.error(err);

      Swal.fire(
        "Error",
        err?.response?.data?.message || "Validation failed",
        "error",
      );
    } finally {
      setValidating(false);
    }
  };

  const handleConfirmUpload = async () => {
    try {
      if (!validationResult?.validRows?.length) {
        Swal.fire("Error", "No valid rows to upload", "error");
        return;
      }

      const res = await api.post("/product/bulk-upload", {
        categoryId,
        subcategoryId,
        rows: validationResult.validRows,
      });

      Swal.fire({
        icon: "success",
        title: "Upload Complete",
        text: res.data.message || "Products uploaded successfully",
      });

      await fetchProducts();

      // Reset state
      setValidationResult(null);
    } catch (err: any) {
      console.error(err);

      Swal.fire(
        "Error",
        err?.response?.data?.message || "Upload failed",
        "error",
      );
    }
  };
  /* ================================
       FETCH PRODUCTS
  ================================= */
  const fetchProducts = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;

      try {
        if (!silent) {
          setTableLoading(true);
        }

        const params = {
          page: pagination.currentPage,
          limit: pagination.itemsPerPage,
          status: statusFilter !== "all" ? statusFilter : undefined,
          search: searchQuery ? searchQuery : undefined,
          brand: brandFilter ? brandFilter : undefined,
          sortBy,
          sortOrder,
        };

        const res = await api.get("/product/my-listed-products", { params });
        const data: ApiResponse = res.data;

        if (data.success) {
          // Background polling (and re-fetches after unrelated state settles) can
          // return data that's identical to what's already on screen. Bailing out
          // of the state update when nothing actually changed avoids re-rendering
          // the whole table every 30s for no visible difference.
          setProducts((prev) =>
            prev.length === data.products.length &&
            JSON.stringify(prev) === JSON.stringify(data.products)
              ? prev
              : data.products,
          );

          const nextTotalPages = data.totalPages || 1;
          const nextTotalItems = data.total || 0;
          setPagination((prev) =>
            prev.totalPages === nextTotalPages &&
            prev.totalItems === nextTotalItems
              ? prev
              : { ...prev, totalPages: nextTotalPages, totalItems: nextTotalItems },
          );

          if (data.stats) {
            setStats((prev) =>
              JSON.stringify(prev) === JSON.stringify(data.stats)
                ? prev
                : data.stats,
            );
          }
        }
      } catch (err) {
        console.error("Error loading products:", err);
      } finally {
        if (!silent) {
          setTableLoading(false);
        }
      }
    },
    [
      pagination.currentPage,
      pagination.itemsPerPage,
      statusFilter,
      searchQuery,
      brandFilter,
      sortBy,
      sortOrder,
    ],
  );

  //  first load
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await fetchProducts({ silent: true });
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchProducts]);

  useEffect(() => {
    fetchProducts();
  }, [
    pagination.currentPage,
    pagination.itemsPerPage,
    sortBy,
    sortOrder,
    statusFilter,
    fetchProducts,
  ]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      setPagination((p) => ({ ...p, currentPage: 1 }));
      setSearchQuery(searchInput.trim());
    }, 450);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchInput]);

  useEffect(() => {
    if (brandDebounceRef.current) {
      clearTimeout(brandDebounceRef.current);
    }

    brandDebounceRef.current = window.setTimeout(() => {
      setPagination((p) => ({ ...p, currentPage: 1 }));
      setBrandFilter(brandInput.trim());
    }, 450);

    return () => {
      if (brandDebounceRef.current) {
        clearTimeout(brandDebounceRef.current);
      }
    };
  }, [brandInput]);

  useEffect(() => {
    const id = setInterval(() => {
      fetchProducts({ silent: true });
    }, 30000);
    return () => clearInterval(id);
  }, [fetchProducts]);

  /* ================================
       ACTION HANDLERS
  ================================= */
  const handleProductAction = async (
    action: ActionType,
    productId: number,
    reason?: string,
  ) => {
    try {
      if (action === "delete") {
        await api.delete(`/product/delete-product/${productId}`);

        setProducts((prev) => prev.filter((p) => p.product_id !== productId));

        setStats((prev) => ({
          ...prev,
          total: Math.max(0, prev.total - 1),
          pending: Math.max(0, prev.pending - 1),
        }));

        Swal.fire({
          icon: "success",
          title: "Success",
          text: "Product deleted successfully",
          showConfirmButton: false,
        });
      }

      if (action === "request_resubmission") {
        const res = await api.post(`/product/submission/${productId}`, {
          reason: reason || null,
        });

        setProducts((prev) =>
          prev.map((p) =>
            p.product_id === productId
              ? { ...p, status: "sent_for_approval" }
              : p,
          ),
        );

        Swal.fire({
          icon: "success",
          title: "Success",
          text: res.data.message || "Product sent for approval successfully",
          showConfirmButton: false,
        });
      }
    } catch (error: any) {
      console.error("Error performing action:", error);
      alert(error.message || "Error performing action");
      throw error;
    } finally {
    }
  };

  const toggleVisibility = async (productId: number, current: boolean) => {
    try {
      await api.patch(`/product/visibility/${productId}`, {
        is_visible: !current,
      });

      setProducts((prev) =>
        prev.map((p) =>
          p.product_id === productId ? { ...p, is_visible: !current } : p,
        ),
      );
    } catch (error) {
      console.error("Visibility update failed", error);
      Swal.fire("Error", "Failed to update visibility", "error");
    }
  };

  const toggleSearchable = async (productId: number, current: boolean) => {
    try {
      await api.patch(`/product/searchable/${productId}`, {
        is_searchable: !current,
      });

      setProducts((prev) =>
        prev.map((p) =>
          p.product_id === productId ? { ...p, is_searchable: !current } : p,
        ),
      );
    } catch (error) {
      console.error("Searchable update failed", error);
      Swal.fire("Error", "Failed to update searchable status", "error");
    }
  };

  const openActionModal = (product: ProductItem, actionType: ActionType) => {
    setModalState({ isOpen: true, product, actionType });
  };

  const closeModal = () => {
    setModalState({
      isOpen: false,
      product: null,
      actionType: "approve",
    });
  };

  const handleClearSearch = () => {
    setSearchInput("");
    setSearchQuery("");
    setPagination((p) => ({ ...p, currentPage: 1 }));
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination((prev) => ({ ...prev, currentPage: page }));
    }
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();

    if (!categoryId || !subcategoryId) {
      Swal.fire("Error", "Select category & subcategory first", "error");
      return;
    }

    reader.onload = () => {
      if (!reader.result) return;

      const data = new Uint8Array(reader.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: "array" });

      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      // const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      // const cleanedRows = json.slice(2);
      const raw = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
      }) as any[][];

      // find header row (first row with actual column names)
      // const headerRowIndex = raw.findIndex((row) =>
      //   row.some((cell) => cell && cell.toString().trim() !== ""),
      // );
      const headerRowIndex = raw.findIndex((row) =>
        row.includes("productName"),
      );

      // extract headers
      const headers = raw[headerRowIndex] as string[];

      // extract data rows after headers
      const dataRows = raw.slice(headerRowIndex + 3);

      // convert to objects
      // const cleanedRows = dataRows.map((row) => {
      //   const obj: any = {};
      //   headers.forEach((key: string, i: number) => {
      //     // obj[key] = row[i];
      //   });
      //   return obj;
      // });

      const cleanedRows = dataRows
        .map((row) => {
          const obj: any = {};
          headers.forEach((key: string, i: number) => {
            obj[key] = typeof row[i] === "string" ? row[i].trim() : row[i];
          });
          return obj;
        })
        .filter((row) => Object.values(row).some((val) => val !== ""));

      const hasInvalid = cleanedRows.some(
        (row) => !row.productName || !row.brandName,
      );

      if (hasInvalid) {
        Swal.fire("Error", "Some rows missing required fields", "error");
        return;
      }

      setValidationResult(null);
      // setRows(cleanedRows);
      validateBulk(cleanedRows);
    };

    reader.readAsArrayBuffer(file);
  };

  /* ================================
       RENDER
  ================================= */
  if (loading && products?.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <FaSpinner className="animate-spin text-4xl text-[#852BAF]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <ActionModal
        isOpen={modalState.isOpen}
        onClose={closeModal}
        onSubmit={(action, reason) =>
          modalState.product
            ? handleProductAction(action, modalState.product.product_id, reason)
            : Promise.resolve()
        }
        product={modalState.product}
        actionType={modalState.actionType}
      />

      <BulkUploadModal
        isOpen={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        categoryId={categoryId}
        setCategoryId={setCategoryId}
        subcategoryId={subcategoryId}
        setSubcategoryId={setSubcategoryId}
        onFileUpload={handleFileUpload}
      />

      <div
        className="bg-white rounded-3xl overflow-hidden"
        style={{ border: "1px solid rgba(133,43,175,0.1)", boxShadow: "0 4px 32px rgba(133,43,175,0.07)" }}
      >
        {/* HEADER */}
        <div
          className="flex flex-col justify-between px-6 py-5 md:flex-row md:items-center rounded-t-3xl"
          style={{
            background:
              "linear-gradient(135deg, rgba(133,43,175,0.04) 0%, rgba(252,63,120,0.03) 100%)",
            borderBottom: "1px solid rgba(133,43,175,0.08)",
          }}
        >
          <div className="flex items-center mb-4 md:mb-0">
            <div
              className="flex items-center justify-center w-12 h-12 mr-4 shadow-lg rounded-2xl"
              style={{
                background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
                boxShadow: "0 6px 20px rgba(133,43,175,0.3)",
              }}
            >
              <FiPackage className="text-xl text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 md:text-3xl">
                Product{" "}
                <span className="gradient-text-brand">Management</span>
              </h1>
              <p className="text-sm text-gray-500 font-medium mt-0.5">
                Review, manage and track all your products
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-sm text-right text-gray-500 md:block">
              <div className="font-semibold text-gray-700">
                {products?.length || 0} products shown
              </div>
              <div className="text-xs text-gray-400">Auto-refresh · 30s</div>
            </div>

            <button
              onClick={() => setBulkModalOpen(true)}
              className="px-4 py-2.5 text-white rounded-xl cursor-pointer flex items-center gap-2 font-semibold text-sm transition-all duration-200 hover:opacity-90 active:scale-95"
              style={{
                background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
                boxShadow: "0 4px 14px rgba(133,43,175,0.28)",
              }}
            >
              <FaUpload className="text-xs" />
              Bulk Upload
            </button>
          </div>
        </div>

        <div className="p-5 md:p-6">

        {/* STATS */}
        <div className="grid grid-cols-2 gap-4 mb-6 md:grid-cols-6">
          <StatsCard
            label="Total Products"
            value={stats.total}
            icon={FiPackage}
            color="from-gray-500 to-gray-700"
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
          />

          <StatsCard
            label="Pending"
            value={stats.pending}
            icon={FaClock}
            color="from-yellow-500 to-yellow-700"
            active={statusFilter === "pending"}
            onClick={() => setStatusFilter("pending")}
          />

          <StatsCard
            label="Sent for Approval"
            value={stats.sent_for_approval}
            icon={FaPaperPlane}
            color="from-indigo-500 to-indigo-700"
            active={statusFilter === "sent_for_approval"}
            onClick={() => setStatusFilter("sent_for_approval")}
          />

          <StatsCard
            label="Approved"
            value={stats.approved}
            icon={FaCheckCircle}
            color="from-green-500 to-green-700"
            active={statusFilter === "approved"}
            onClick={() => setStatusFilter("approved")}
          />

          <StatsCard
            label="Rejected"
            value={stats.rejected}
            icon={FaTimesCircle}
            color="from-red-500 to-red-700"
            active={statusFilter === "rejected"}
            onClick={() => setStatusFilter("rejected")}
          />

          <StatsCard
            label="Resubmission"
            value={stats.resubmission}
            icon={FaRedo}
            color="from-blue-500 to-blue-700"
            active={statusFilter === "resubmission"}
            onClick={() => setStatusFilter("resubmission")}
          />
        </div>

        {/* FILTERS + SEARCH */}
        <div
          className="flex flex-col gap-3 mb-6 md:flex-row p-4 rounded-2xl"
          style={{ background: "rgba(133,43,175,0.03)", border: "1px solid rgba(133,43,175,0.08)" }}
        >
          <div className="w-80">
            <div className="relative">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by product name..."
                className="w-full py-2.5 pl-10 pr-16 text-sm font-medium border rounded-xl outline-none transition-all duration-200 focus:ring-2 focus:ring-[#852BAF]/30 focus:border-[#852BAF] bg-white"
                style={{ borderColor: "rgba(133,43,175,0.2)" }}
              />
              <FaSearch className="absolute left-3 top-3 text-[#852BAF]/40 pointer-events-none text-sm" />

              {searchInput?.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-1.5 top-1.5 px-2 py-1.5 text-gray-500 rounded-lg text-xs font-semibold bg-gray-100 hover:bg-gray-200 cursor-pointer transition-colors"
                >
                  ✕ Clear
                </button>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="relative">
              <input
                type="text"
                value={brandInput}
                onChange={(e) => setBrandInput(e.target.value)}
                placeholder="Filter by brand..."
                className="w-80 py-2.5 pl-9 pr-3 text-sm font-medium border rounded-xl outline-none transition-all duration-200 focus:ring-2 focus:ring-[#852BAF]/30 focus:border-[#852BAF] bg-white"
                style={{ borderColor: "rgba(133,43,175,0.2)" }}
              />
              <FaSearch className="absolute left-3 top-3 text-[#852BAF]/40 pointer-events-none text-sm" />
            </div>

            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPagination((prev) => ({ ...prev, currentPage: 1 }));
                }}
                className="appearance-none pl-9 pr-8 py-2.5 text-sm font-medium border rounded-xl outline-none bg-white focus:ring-2 focus:ring-[#852BAF]/30 focus:border-[#852BAF] cursor-pointer transition-all"
                style={{ borderColor: "rgba(133,43,175,0.2)" }}
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="sent_for_approval">Sent for Approval</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="resubmission">Resubmission</option>
              </select>
              <FaFilter className="absolute left-3 top-3 text-[#852BAF]/40 pointer-events-none text-xs" />
            </div>

            <select
              value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [col, order] = e.target.value.split(":");
                setSortBy(col);
                setSortOrder(order as "asc" | "desc");
                setPagination((prev) => ({ ...prev, currentPage: 1 }));
              }}
              className="px-4 py-2.5 text-sm font-medium border rounded-xl outline-none bg-white focus:ring-2 focus:ring-[#852BAF]/30 focus:border-[#852BAF] cursor-pointer transition-all"
              style={{ borderColor: "rgba(133,43,175,0.2)" }}
            >
              <option value="created_at:desc">Newest First</option>
              <option value="created_at:asc">Oldest First</option>
              <option value="product_name:asc">Name A–Z</option>
              <option value="product_name:desc">Name Z–A</option>
            </select>
          </div>
        </div>

        {/* TABLE */}
        <div className="relative overflow-x-auto bg-white rounded-2xl" style={{ border: "1px solid rgba(133,43,175,0.1)", boxShadow: "0 2px 16px rgba(133,43,175,0.06)" }}>
          {tableLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm">
              <FaSpinner className="animate-spin text-3xl text-[#852BAF]" />
            </div>
          )}

          <table className="min-w-full divide-y divide-gray-100">
            {/* TABLE HEADER */}
            <thead className="sticky top-0 z-10">
              <tr
                style={{
                  background:
                    "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
                }}
              >
                {[
                  "Product",
                  "Brand",
                  "Category",
                  "Subcategory",
                  "SubType",
                  "Status",
                  "Rejection Reason",
                  "Visibility",
                  "Searchable",
                  "Created",
                  "Action",
                ].map((head) => (
                  <th
                    key={head}
                    className="px-5 py-3.5 text-[10px] font-bold tracking-widest text-gray-500 uppercase whitespace-nowrap"
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>

            {/* TABLE BODY */}
            <tbody className="divide-y divide-gray-100">
              {products.map((product, index) => (
                <tr
                  key={product.product_id}
                  className="transition-colors duration-150 bg-white hover:bg-purple-50/40 row-animate"
                  style={{ animationDelay: `${index * 35}ms` }}
                >
                  {/* PRODUCT */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3 min-w-[180px] max-w-[220px]">
                      {product.main_image ? (
                        <div className="w-11 h-11 overflow-hidden bg-gray-100 rounded-xl shrink-0" style={{ border: "1px solid rgba(133,43,175,0.12)" }}>
                          <img
                            src={`${R2_BASE_URL}/${product.main_image}`}
                            alt={product.product_name}
                            loading="lazy"
                            decoding="async"
                            className="object-cover w-full h-full hover:scale-110 transition-transform duration-300"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-center w-11 h-11 rounded-xl shrink-0" style={{ background: "rgba(133,43,175,0.06)", border: "1px dashed rgba(133,43,175,0.2)" }}>
                          <FaBox className="text-sm" style={{ color: "#852BAF" }} />
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2">
                          {product.product_name || "Unnamed Product"}
                        </div>
                        <div className="text-[10px] text-gray-400 font-medium mt-0.5">
                          ID #{product.product_id}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* BRAND */}
                  <td className="px-4 py-3.5">
                    <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-700 whitespace-nowrap">
                      {product.brand_name || "N/A"}
                    </span>
                  </td>

                  {/* CATEGORY */}
                  <td className="px-4 py-3.5">
                    <span className="text-xs font-medium text-gray-700">
                      {product.category_name || product.custom_category || "—"}
                    </span>
                  </td>

                  {/* SUBCATEGORY */}
                  <td className="px-4 py-3.5">
                    <span className="text-xs font-medium text-gray-600">
                      {product.subcategory_name || product.custom_subcategory || "—"}
                    </span>
                  </td>

                  {/* SUB TYPE */}
                  <td className="px-4 py-3.5">
                    <span className="text-xs font-medium text-gray-500">
                      {product.sub_subcategory_name || product.custom_sub_subcategory || "—"}
                    </span>
                  </td>

                  {/* STATUS */}
                  <td className="px-4 py-3.5">
                    <StatusChip status={product.status} />
                  </td>

                  {/* REJECTION REASON */}
                  <td className="px-4 py-3.5">
                    {product.rejection_reason ? (
                      <span
                        className="block text-xs text-red-600 font-medium max-w-[140px] truncate"
                        title={product.rejection_reason}
                      >
                        {product.rejection_reason}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>

                  {/* VISIBILITY */}
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col items-start gap-1">
                      <button
                        onClick={() => toggleVisibility(product.product_id, product.is_visible)}
                        title={product.is_visible ? "Visible" : "Hidden"}
                        className={`cursor-pointer relative inline-flex h-5 w-9 items-center rounded-full toggle-track ${product.is_visible ? "bg-emerald-500" : "bg-gray-200"}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm toggle-thumb ${product.is_visible ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                      <span className={`text-[9px] font-bold uppercase tracking-wide ${product.is_visible ? "text-emerald-600" : "text-gray-400"}`}>
                        {product.is_visible ? "Visible" : "Hidden"}
                      </span>
                    </div>
                  </td>

                  {/* SEARCHABLE */}
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col items-start gap-1">
                      <button
                        onClick={() => toggleSearchable(product.product_id, product.is_searchable)}
                        title={product.is_searchable ? "Searchable" : "Hidden from search"}
                        className={`cursor-pointer relative inline-flex h-5 w-9 items-center rounded-full toggle-track ${product.is_searchable ? "bg-indigo-500" : "bg-gray-200"}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm toggle-thumb ${product.is_searchable ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                      <span className={`text-[9px] font-bold uppercase tracking-wide ${product.is_searchable ? "text-indigo-600" : "text-gray-400"}`}>
                        {product.is_searchable ? "Listed" : "Hidden"}
                      </span>
                    </div>
                  </td>

                  {/* CREATED */}
                  <td className="px-4 py-3.5">
                    <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
                      {product.created_at
                        ? new Date(product.created_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })
                        : "—"}
                    </span>
                  </td>

                  {/* ACTIONS */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1">
                      <Link
                        to={routes.vendor.products.review.replace(":productId", String(product.product_id))}
                        title="View"
                      >
                        <span className="action-btn flex items-center justify-center p-2 rounded-xl bg-gray-50 text-gray-500 hover:bg-gray-100 cursor-pointer border border-gray-100">
                          <FaEye size={12} />
                        </span>
                      </Link>

                      <Link
                        to={routes.vendor.products.manageProduct.replace(":productId", String(product.product_id))}
                        title="Manage Variants"
                      >
                        <span className="action-btn flex items-center justify-center p-2 rounded-xl bg-blue-50 text-blue-500 hover:bg-blue-100 cursor-pointer border border-blue-100">
                          <FaCogs size={12} />
                        </span>
                      </Link>

                      {!["approved", "rejected", "sent_for_approval"].includes(product.status) && (
                        <Link
                          to={routes.vendor.products.edit.replace(":id", String(product.product_id))}
                          title="Edit Product"
                        >
                          <span className="action-btn flex items-center justify-center p-2 rounded-xl bg-purple-50 text-purple-500 hover:bg-purple-100 cursor-pointer border border-purple-100">
                            <FaEdit size={12} />
                          </span>
                        </Link>
                      )}

                      {!["approved", "rejected", "resubmission", "sent_for_approval"].includes(product.status) && (
                        <button
                          title="Delete"
                          onClick={() => openActionModal(product, "delete")}
                          className="action-btn flex items-center justify-center p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 cursor-pointer border border-red-100"
                        >
                          <FaTrash size={12} />
                        </button>
                      )}

                      {["pending", "resubmission"].includes(product.status) && (
                        <button
                          title="Send for Approval"
                          onClick={() => openActionModal(product, "request_resubmission")}
                          className="action-btn flex items-center justify-center p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 cursor-pointer border border-emerald-100"
                        >
                          <FaPaperPlane size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/*  VALIDATING LOADER */}
        {validating && (
          <div className="flex items-center gap-2 mt-4 text-sm font-semibold text-[#852BAF]">
            <FaSpinner className="animate-spin" />
            Validating file...
          </div>
        )}

        {/*  VALIDATION SUMMARY */}
        {validationResult && (
          <div
            className="mt-5 p-5 rounded-2xl"
            style={{ background: "rgba(133,43,175,0.03)", border: "1px solid rgba(133,43,175,0.1)" }}
          >
            <h3 className="mb-4 text-sm font-extrabold text-gray-800 uppercase tracking-widest">
              Bulk Validation Result
            </h3>

            <div className="flex gap-4 mb-4">
              <div className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-100 text-xs font-bold text-emerald-700">
                ✓ {validationResult.validCount} Valid Rows
              </div>
              <div className="px-4 py-2 rounded-xl bg-red-50 border border-red-100 text-xs font-bold text-red-600">
                ✕ {validationResult.invalidCount} Invalid Rows
              </div>
            </div>

            {validationResult.validCount > 0 && (
              <button
                onClick={handleConfirmUpload}
                className="px-5 py-2.5 text-sm text-white font-bold rounded-xl cursor-pointer transition-all hover:opacity-90 active:scale-95"
                style={{ background: "linear-gradient(135deg, #059669 0%, #10b981 100%)", boxShadow: "0 4px 14px rgba(5,150,105,0.3)" }}
              >
                Upload Valid Rows
              </button>
            )}
          </div>
        )}

        {/*  INVALID ROW DETAILS */}
        {validationResult?.invalidRows?.length > 0 && (
          <div className="mt-6 bg-white border border-red-200 shadow-sm rounded-2xl">
            {/* HEADER */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-red-50 rounded-t-2xl">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-red-700">
                ❌ Invalid Rows ({validationResult.invalidCount})
              </h3>
            </div>

            {/* LIST */}
            <div className="overflow-y-auto divide-y max-h-72">
              {validationResult.invalidRows.map((row: any, i: number) => (
                <div key={i} className="px-5 py-3 transition hover:bg-red-50">
                  {/* ROW HEADER */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-800">
                      Row {row.rowNumber}
                    </span>

                    <span className="px-2 py-1 text-xs text-red-600 bg-red-100 rounded-full">
                      {row.errors.length} error
                      {row.errors.length > 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* ERRORS */}
                  <ul className="mt-2 space-y-1 text-sm text-red-600">
                    {row.errors.map((err: string, j: number) => (
                      <li key={j} className="flex items-start gap-2">
                        <span className="text-red-400">•</span>
                        <span>{err}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PAGINATION */}
        {pagination.totalPages > 1 && (
          <div
            className="flex items-center justify-between mt-5 px-4 py-3.5 rounded-2xl"
            style={{ background: "rgba(133,43,175,0.03)", border: "1px solid rgba(133,43,175,0.08)" }}
          >
            <div className="text-xs font-semibold text-gray-500">
              Showing{" "}
              <span className="text-gray-800">{(pagination.currentPage - 1) * pagination.itemsPerPage + 1}</span>
              {" – "}
              <span className="text-gray-800">{Math.min(pagination.currentPage * pagination.itemsPerPage, pagination.totalItems)}</span>
              {" of "}
              <span className="text-[#852BAF] font-bold">{pagination.totalItems}</span>
              {" products"}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handlePageChange(pagination.currentPage - 1)}
                disabled={pagination.currentPage === 1}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#852BAF] hover:text-[#852BAF]"
                style={{ borderColor: "rgba(133,43,175,0.2)", color: "#555" }}
              >
                ← Prev
              </button>

              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                let pageNum: number;
                if (pagination.totalPages <= 5) pageNum = i + 1;
                else if (pagination.currentPage <= 3) pageNum = i + 1;
                else if (pagination.currentPage >= pagination.totalPages - 2) pageNum = pagination.totalPages - 4 + i;
                else pageNum = pagination.currentPage - 2 + i;

                const isActive = pagination.currentPage === pageNum;
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className="w-8 h-8 text-xs font-bold rounded-xl cursor-pointer transition-all"
                    style={isActive
                      ? { background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", color: "#fff", boxShadow: "0 2px 8px rgba(133,43,175,0.3)" }
                      : { background: "white", color: "#555", border: "1px solid rgba(133,43,175,0.2)" }
                    }
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                onClick={() => handlePageChange(pagination.currentPage + 1)}
                disabled={pagination.currentPage === pagination.totalPages}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover:border-[#852BAF] hover:text-[#852BAF]"
                style={{ borderColor: "rgba(133,43,175,0.2)", color: "#555" }}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        {/* EMPTY STATE */}
        {products?.length === 0 && !loading && (
          <div className="py-20 text-center">
            <div
              className="flex items-center justify-center w-20 h-20 mx-auto mb-5 rounded-3xl"
              style={{ background: "linear-gradient(135deg, rgba(133,43,175,0.08) 0%, rgba(252,63,120,0.06) 100%)", border: "1px dashed rgba(133,43,175,0.2)" }}
            >
              <FaFileAlt className="text-3xl" style={{ color: "#852BAF" }} />
            </div>
            <h3 className="text-lg font-extrabold text-gray-800 tracking-tight">No Products Found</h3>
            <p className="mt-1.5 text-sm text-gray-400 font-medium">
              {searchQuery || statusFilter !== "all"
                ? "Try adjusting your filters or search query"
                : "No products have been submitted yet"}
            </p>
          </div>
        )}
        </div>{/* /p-5 md:p-6 */}
      </div>{/* /card */}
    </div>
  );
}
