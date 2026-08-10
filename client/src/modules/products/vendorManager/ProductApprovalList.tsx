"use client";

import React, { useEffect, useState, useCallback } from "react";
import Swal from "sweetalert2";
import {
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaEye,
  FaFileAlt,
  FaSpinner,
  FaSearch,
  FaSort,
  FaSortUp,
  FaQuestionCircle,
  FaSortDown,
  FaRedo,
  FaCheck,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import { Link } from "react-router-dom";
import { FiBox, FiCalendar, FiDownload, FiX } from "react-icons/fi";
import { routes } from "../../../routes";
import { api } from "../../../common/api/api";
import { confirmDialog } from "../../../common/utils/confirmDialog";

/* ================================
       TYPES
================================ */
type BackendProductStatus =
  | "pending"
  | "sent_for_approval"
  | "approved"
  | "rejected"
  | "resubmission";

type ProductStatus = "pending" | "approved" | "rejected" | "resubmission";

type SortColumn = "product_id" | "product_name" | "created_at";

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
  status: BackendProductStatus;
  rejection_reason: string | null;
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
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  resubmission: number;
}

interface ApiResponse {
  success: boolean;
  products: ProductItem[];
  total: number;
  page: number;
  totalPages: number;
  stats: Stats;
}

type ActionType = "approve" | "reject" | "request_resubmission";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

/* ================================
       STATUS CHIP
================================ */
const StatusChip = ({ status }: { status: ProductStatus }) => {
  const configMap: Record<
    ProductStatus,
    {
      color: string;
      icon: React.ComponentType<{ size?: number; className?: string }>;
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
  };

  const cfg = configMap[status] ?? {
    color: "bg-gray-200 text-gray-700 border-gray-300",
    icon: FaQuestionCircle,
    text: status || "Unknown",
  };

  const Icon = cfg.icon;

  return (
    <div
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full border shadow-sm text-[11px] font-semibold tracking-wide uppercase ${cfg.color}`}
    >
      <Icon className="mr-1" size={12} />
      {cfg.text}
    </div>
  );
};

// Stats
interface StatCardProps {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const StatCard = ({ title, value, icon: Icon, color }: StatCardProps) => {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg bg-gradient-to-br ${color}`}
    >
      <div className="absolute top-0 right-0 w-24 h-24 -mt-10 -mr-10 bg-white rounded-full opacity-20" />

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide uppercase opacity-90">
            {title}
          </p>
          <p className="mt-2 text-2xl font-bold">{value}</p>
        </div>

        <div className="p-3 bg-white/20 rounded-xl">
          <Icon className="text-xl" />
        </div>
      </div>
    </div>
  );
};

const SORT_FIELD_MAP: Record<SortColumn, string> = {
  product_id: "product_id",
  product_name: "product_name",
  created_at: "created_at",
};

/* ================================
       MAIN COMPONENT
================================ */
export default function ProductManagerList() {
  const [productTab, setProductTab] = useState<"catalog" | "flea_market">("catalog");
  const [products, setProducts] = useState<
    (Omit<ProductItem, "status"> & { status: ProductStatus })[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [vendors, setVendors] = useState<
    { vendor_id: number; full_name: string }[]
  >([]);
  const [vendorFilter, setVendorFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportDownloading, setReportDownloading] = useState(false);
  const [reportBrand, setReportBrand] = useState("");
  const [reportStatus, setReportStatus] = useState("");

  const [stats, setStats] = useState<Stats>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    resubmission: 0,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [brandSearch, setBrandSearch] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortColumn>("product_id");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    itemsPerPage: 10,
  });

  const okBtnClass =
    "px-6 py-2 rounded-xl font-bold text-white bg-[#852BAF] transition-all duration-300 cursor-pointer " +
    "hover:bg-gradient-to-r hover:from-[#852BAF] hover:to-[#FC3F78] active:scale-95";

  const getSortIcon = (column: SortColumn) => {
    if (sortBy !== column) return <FaSort className="ml-1 opacity-30" />;
    return sortOrder === "asc" ? (
      <FaSortUp className="ml-1 text-[#852BAF]" />
    ) : (
      <FaSortDown className="ml-1 text-[#852BAF]" />
    );
  };

  const fetchVendors = async () => {
    try {
      const res = await api.get("/vendor/approved-list");

      if (res.data.success) {
        setVendors(res.data.vendors);
      }
    } catch (err) {
      console.error("Error fetching vendors", err);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const normalizeManagerStatus = (
    status: BackendProductStatus,
  ): ProductStatus => {
    if (status === "sent_for_approval") return "pending";
    return status as ProductStatus;
  };

  const normalizeStatusForApi = (status: string) => {
    if (status === "pending") return "sent_for_approval";
    return status;
  };

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);

      const params = {
        page: pagination.currentPage,
        limit: pagination.itemsPerPage,
        status:
          statusFilter !== "all" ? normalizeStatusForApi(statusFilter) : "",
        search: searchQuery,
        brand: brandSearch,
        vendorId: vendorSearch,
        productType: productTab,

        sortBy: SORT_FIELD_MAP[sortBy],
        sortOrder,
      };

      const res = await api.get("/product/all-products", { params });
      const data: ApiResponse = res.data;

      if (data.success) {
        const normalizedProducts = data.products.map((p) => ({
          ...p,
          status: normalizeManagerStatus(p.status),
        }));

        setProducts(normalizedProducts);
        setPagination((prev) => ({
          ...prev,
          totalPages: data.totalPages || 1,
          totalItems: data.total || 0,
        }));

        if (data.stats) setStats(data.stats);
      }
    } catch (err) {
      console.error("Error loading products:", err);
    } finally {
      setLoading(false);
    }
  }, [
    pagination.currentPage,
    pagination.itemsPerPage,
    statusFilter,
    searchQuery,
    brandSearch,
    vendorSearch,
    productTab,
    sortBy,
    sortOrder,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 400);

    return () => clearTimeout(timer);
  }, [fetchProducts]);

  const handleDelete = async (product: ProductItem) => {
    const confirmed = await confirmDialog({
      title: "Delete Product?",
      text: `Are you sure you want to delete "${product.product_name}"?`,
      confirmButtonText: "Delete",
      confirmButtonColor: "#DC2626",
      cancelButtonText: "Cancel",
      reverseButtons: true,
    });

    if (!confirmed) return;

    try {
      const res = await api.delete(
        `/product/remove-product/${product.product_id}`,
      );

      if (!res.data.success) {
        throw new Error(res.data.message || "Delete failed");
      }

      // Update only the affected row locally instead of refetching the whole list.
      const removedStatus = normalizeManagerStatus(product.status);
      setProducts((prev) =>
        prev.filter((p) => p.product_id !== product.product_id),
      );
      setPagination((prev) => ({
        ...prev,
        totalItems: Math.max(0, prev.totalItems - 1),
      }));
      setStats((prev) => ({
        ...prev,
        total: Math.max(0, prev.total - 1),
        [removedStatus]: Math.max(0, prev[removedStatus] - 1),
      }));

      await Swal.fire({
        title: "Deleted!",
        text: "Product deleted successfully.",
        icon: "success",
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (error: unknown) {
      await Swal.fire({
        title: "Error",
        text: errorMessage(error, "Failed to delete product."),
        icon: "error",
      });
    }
  };

  const handleProductAction = async (
    action: ActionType,
    product: ProductItem,
  ) => {
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
        text: `Do you want to approve "${product.product_name}"?`,
        icon: "success",
        confirmText: "Approve",
        confirmColor: "#16A34A",
        needsReason: false,
      },
      reject: {
        title: "Reject Product?",
        text: `Do you want to reject "${product.product_name}"?`,
        icon: "error",
        confirmText: "Reject",
        confirmColor: "#DC2626",
        needsReason: true,
        placeholder: "Provide rejection reason...",
      },
      request_resubmission: {
        title: "Allow Resubmission?",
        text: `Allow vendor to resubmit "${product.product_name}"?`,
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
        `/manager/product/${endpoint}/${product.product_id}`,
        reason ? { reason } : {},
      );

      if (!res.data.success)
        throw new Error(res.data.message || "Action failed");

      // Update only the affected row locally instead of refetching the whole list.
      const oldStatus = normalizeManagerStatus(product.status);
      const newStatus: ProductStatus =
        action === "approve"
          ? "approved"
          : action === "reject"
            ? "rejected"
            : "resubmission";

      setStats((prev) => ({
        ...prev,
        [oldStatus]: Math.max(0, prev[oldStatus] - 1),
        [newStatus]: prev[newStatus] + 1,
      }));

      if (statusFilter !== "all" && statusFilter !== newStatus) {
        // Row no longer matches the active filter, so it drops out of view.
        setProducts((prev) =>
          prev.filter((p) => p.product_id !== product.product_id),
        );
        setPagination((prev) => ({
          ...prev,
          totalItems: Math.max(0, prev.totalItems - 1),
        }));
      } else {
        setProducts((prev) =>
          prev.map((p) =>
            p.product_id === product.product_id
              ? {
                  ...p,
                  status: newStatus,
                  rejection_reason:
                    action === "reject"
                      ? reason ?? null
                      : p.rejection_reason,
                }
              : p,
          ),
        );
      }

      await Swal.fire({
        title: "Success!",
        text: res.data.message || "Action completed successfully.",
        icon: "success",
        timer: 1400,
        showConfirmButton: false,
        customClass: { popup: "rounded-2xl" },
      });
    } catch (error: unknown) {
      await Swal.fire({
        title: "Failed",
        text: errorMessage(error, "Something went wrong."),
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

  const handleSort = (column: SortColumn) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }

    setPagination((prev) => ({ ...prev, currentPage: 1 }));
  };

  const handleDownloadReport = async () => {
    if ((fromDate && !toDate) || (!fromDate && toDate)) {
      await Swal.fire("Date range incomplete", "Select both From and To dates.", "warning");
      return;
    }
    if (fromDate && toDate && fromDate > toDate) {
      await Swal.fire("Invalid period", "From date cannot be after To date.", "warning");
      return;
    }
    try {
      setReportDownloading(true);
      const response = await api.get("/product/download-product-report", {
        params: {
          vendorId: vendorFilter || undefined,
          brand: reportBrand.trim() || undefined,
          status: reportStatus ? normalizeStatusForApi(reportStatus) : undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        },
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;

      link.setAttribute("download", `manager_product_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setReportModalOpen(false);
      await Swal.fire({ icon: "success", title: "Report downloaded", text: "Your filtered Excel report is ready.", timer: 1800, showConfirmButton: false });
    } catch (error) {
      console.error("Download failed", error);
      await Swal.fire("Download failed", "Unable to generate the product report. Please try again.", "error");
    } finally {
      setReportDownloading(false);
    }
  };

  const onSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
      setPagination((prev) => ({ ...prev, currentPage: 1 }));
    },
    [],
  );

  const onBrandSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setBrandSearch(e.target.value);
      setPagination((prev) => ({ ...prev, currentPage: 1 }));
    },
    [],
  );

  const onVendorSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setVendorSearch(e.target.value);
      setPagination((prev) => ({ ...prev, currentPage: 1 }));
    },
    [],
  );

  return (
    <div className="min-h-screen">
      {reportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !reportDownloading) setReportModalOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="manager-report-title" className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_28px_90px_rgba(39,20,58,0.3)]">
            <div className="relative overflow-hidden bg-gradient-to-br from-[#25103d] via-[#64248c] to-[#b72f72] px-6 py-6 text-white"><div className="absolute -right-10 -top-16 h-40 w-40 rounded-full bg-white/10 blur-2xl" /><div className="relative flex items-start justify-between gap-4"><div className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-white/10"><FiDownload size={21} /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-purple-200">Manager analytics</p><h2 id="manager-report-title" className="mt-1 text-xl font-extrabold">Download product report</h2><p className="mt-1 text-xs text-purple-100/75">Export products across vendors with precise filters.</p></div></div><button type="button" disabled={reportDownloading} onClick={() => setReportModalOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-white/10 transition hover:bg-white/20" aria-label="Close"><FiX /></button></div></div>
            <div className="space-y-5 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><label htmlFor="manager-report-vendor" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Vendor</label><select id="manager-report-vendor" value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-purple-400 focus:bg-white focus:ring-4 focus:ring-purple-100"><option value="">All vendors</option>{vendors.map((vendor) => <option key={vendor.vendor_id} value={vendor.vendor_id}>{vendor.full_name}</option>)}</select></div>
                <div><label htmlFor="manager-report-brand" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Brand</label><input id="manager-report-brand" value={reportBrand} onChange={(event) => setReportBrand(event.target.value)} placeholder="All brands" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-purple-400 focus:bg-white focus:ring-4 focus:ring-purple-100" /></div>
                <div className="sm:col-span-2"><label htmlFor="manager-report-status" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Product status</label><select id="manager-report-status" value={reportStatus} onChange={(event) => setReportStatus(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-purple-400 focus:bg-white focus:ring-4 focus:ring-purple-100"><option value="">All statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="resubmission">Resubmission</option></select></div>
              </div>
              <div className="rounded-2xl border border-purple-100 bg-purple-50/50 p-4"><div className="mb-3 flex items-center gap-2"><FiCalendar className="text-[#852BAF]" /><div><p className="text-sm font-extrabold text-slate-800">Custom period</p><p className="text-xs text-slate-500">Leave both empty to include all dates.</p></div></div><div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="manager-report-from" className="mb-1.5 block text-xs font-semibold text-slate-500">From date</label><input id="manager-report-from" type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} className="w-full rounded-xl border border-purple-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100" /></div><div><label htmlFor="manager-report-to" className="mb-1.5 block text-xs font-semibold text-slate-500">To date</label><input id="manager-report-to" type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} className="w-full rounded-xl border border-purple-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100" /></div></div></div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button type="button" disabled={reportDownloading} onClick={() => { setVendorFilter(""); setReportBrand(""); setReportStatus(""); setFromDate(""); setToDate(""); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-500 transition hover:bg-slate-50">Clear filters</button><button type="button" disabled={reportDownloading} onClick={() => void handleDownloadReport()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-purple-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">{reportDownloading ? <><FaSpinner className="animate-spin" /> Generating...</> : <><FiDownload /> Download Excel</>}</button></div>
            </div>
          </div>
        </div>
      )}
      <div className="p-4 bg-white border border-gray-200 shadow-lg rounded-2xl md:p-6">
        <div className="mb-8 mt-1 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
          <div className="w-12 h-12 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-full flex items-center justify-center shrink-0">
            <FiBox className="text-xl text-white" />
          </div>

          <div>
            <h2 className="text-3xl font-bold text-gray-900">Products</h2>
            <p className="mt-1 text-sm text-gray-500">
              Manage your products, pricing, and stock — all in one place.
            </p>
          </div>
          </div>
          <button type="button" onClick={() => { setVendorFilter(vendorSearch); setReportBrand(brandSearch); setReportStatus(statusFilter === "all" ? "" : statusFilter); setReportModalOpen(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-200 bg-white px-4 py-2.5 text-sm font-bold text-[#852BAF] shadow-sm transition hover:-translate-y-0.5 hover:border-[#852BAF] hover:bg-purple-50 hover:shadow-md"><FiDownload /> Product report</button>
        </div>
        {/* STATS CARDS */}
        <div className="mb-6 inline-flex w-full rounded-2xl border border-purple-100 bg-purple-50/60 p-1.5 sm:w-auto">
          <button
            type="button"
            onClick={() => {
              setProductTab("catalog");
              setPagination((prev) => ({ ...prev, currentPage: 1 }));
            }}
            className={`flex-1 rounded-xl px-5 py-2.5 text-sm font-bold transition sm:flex-none ${productTab === "catalog" ? "bg-white text-[#852BAF] shadow-sm ring-1 ring-purple-100" : "text-slate-500 hover:text-[#852BAF]"}`}
          >
            Ecommerce Products
          </button>
          <button
            type="button"
            onClick={() => {
              setProductTab("flea_market");
              setPagination((prev) => ({ ...prev, currentPage: 1 }));
            }}
            className={`flex-1 rounded-xl px-5 py-2.5 text-sm font-bold transition sm:flex-none ${productTab === "flea_market" ? "bg-white text-[#FC3F78] shadow-sm ring-1 ring-pink-100" : "text-slate-500 hover:text-[#FC3F78]"}`}
          >
            Flea Market Products
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 mb-8 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            title="Total Products"
            value={stats.total}
            icon={FaFileAlt}
            color="from-purple-500 to-purple-700"
          />
          <StatCard
            title="Pending for Review"
            value={stats.pending}
            icon={FaClock}
            color="from-yellow-500 to-yellow-700"
          />
          <StatCard
            title="Approved"
            value={stats.approved}
            icon={FaCheckCircle}
            color="from-green-500 to-green-700"
          />
          <StatCard
            title="Rejected"
            value={stats.rejected}
            icon={FaTimesCircle}
            color="from-red-500 to-red-700"
          />
          <StatCard
            title="Need Resubmission"
            value={stats.resubmission}
            icon={FaRedo}
            color="from-blue-500 to-blue-700"
          />
        </div>

        {/* FILTERS + SEARCH */}
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={onSearchChange}
              placeholder="Search products..."
              className="w-full p-3 pl-10 border border-gray-300 rounded-lg outline-none
                         focus:ring-2 focus:ring-[#852BAF] focus:border-transparent"
            />
            <FaSearch className="absolute text-gray-400 pointer-events-none left-3 top-4" />
          </div>

          <div className="relative">
            <input
              type="text"
              value={brandSearch}
              onChange={onBrandSearchChange}
              placeholder="Filter by brand..."
              className="w-full p-3 pl-10 border border-gray-300 rounded-lg outline-none
                         focus:ring-2 focus:ring-[#852BAF] focus:border-transparent"
            />
            <FaSearch className="absolute text-gray-400 pointer-events-none left-3 top-4" />
          </div>

          <select
            value={vendorSearch}
            onChange={onVendorSearchChange}
            className="w-full p-3 border border-gray-300 rounded-lg cursor-pointer outline-none
                       focus:ring-2 focus:ring-[#852BAF] focus:border-transparent"
          >
            <option value="">All vendors</option>
            {vendors.map((vendor) => (
              <option key={vendor.vendor_id} value={vendor.vendor_id}>
                {vendor.full_name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPagination((p) => ({ ...p, currentPage: 1 }));
            }}
            className="w-full p-3 border border-gray-300 rounded-lg cursor-pointer outline-none
                       focus:ring-2 focus:ring-[#852BAF] focus:border-transparent"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="resubmission">Resubmission</option>
          </select>
        </div>

        {/* TABLE */}
        <div className="relative overflow-hidden border border-gray-100 rounded-2xl">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
              <FaSpinner className="animate-spin text-3xl text-[#852BAF]" />
            </div>
          )}

          <table className="min-w-full divide-y divide-gray-100">
            <thead style={{ background: "linear-gradient(135deg, #fdf8ff 0%, #fff5f8 100%)" }}>
              <tr>
                <th
                  onClick={() => handleSort("product_id")}
                  className="px-4 py-4 text-xs font-bold tracking-wider text-gray-500 uppercase cursor-pointer"
                >
                  <div className="flex items-center">
                    Product ID {getSortIcon("product_id")}
                  </div>
                </th>

                <th
                  onClick={() => handleSort("product_name")}
                  className="px-4 py-4 text-xs font-bold tracking-wider text-gray-500 uppercase cursor-pointer"
                >
                  <div className="flex items-center">
                    Product {getSortIcon("product_name")}
                  </div>
                </th>

                <th className="px-4 py-4 text-xs font-bold tracking-wider text-gray-500 uppercase">
                  Brand
                </th>

                <th className="px-4 py-4 text-xs font-bold tracking-wider text-gray-500 uppercase">
                  Status
                </th>

                <th className="px-4 py-4 text-xs font-bold tracking-wider text-gray-500 uppercase">
                  Rejection Reason
                </th>

                <th
                  onClick={() => handleSort("created_at")}
                  className="px-4 py-4 text-xs font-bold tracking-wider text-gray-500 uppercase cursor-pointer"
                >
                  <div className="flex items-center">
                    Created {getSortIcon("created_at")}
                  </div>
                </th>

                <th className="px-4 py-4 text-xs font-bold tracking-wider text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-50">
              {products.map((product) => (
                <tr key={product.product_id} className="transition-colors hover:bg-purple-50/30">
                  {/* NEW: Product ID cell */}
                  <td className="px-4 py-4">
                    <Link
                      to={routes.manager.productView.replace(":id", product.product_id.toString())}
                      className="inline-flex items-center px-2.5 py-1 text-xs font-bold bg-purple-50 text-[#852BAF] border border-purple-200 rounded-lg hover:bg-[#852BAF] hover:text-white transition-all"
                      title="View"
                    >
                      PRD-{product.product_id}
                    </Link>
                  </td>

                  <td className="px-4 py-4">
                    <Link
                      to={routes.manager.productView.replace(":id", product.product_id.toString())}
                      className="font-semibold text-gray-800 hover:text-[#852BAF] transition-colors text-sm leading-snug line-clamp-2"
                      title="View"
                    >
                      {product.product_name}
                    </Link>
                  </td>

                  <td className="px-4 py-4 text-sm text-gray-500">{product.brand_name}</td>

                  <td className="px-4 py-4">
                    <StatusChip status={product.status} />
                  </td>

                  <td className="px-4 py-4">
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

                  <td className="px-4 py-4 text-sm text-gray-500 whitespace-nowrap">
                    {product.created_at
                      ? new Date(product.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })
                      : "—"}
                  </td>

                  <td className="px-4 py-4">
                    <div className="flex items-center gap-1.5">
                      {/* View */}
                      <Link
                        to={routes.manager.productView.replace(":id", product.product_id.toString())}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-gray-50 border border-gray-200 text-gray-400 hover:bg-[#852BAF] hover:text-white hover:border-[#852BAF] transition-all shadow-sm"
                        title="View"
                      >
                        <FaEye className="text-xs" />
                      </Link>

                      {product.status === "pending" && (
                        <>
                          {/* Approve */}
                          <button
                            onClick={() => handleProductAction("approve", product)}
                            className="inline-flex items-center justify-center w-8 h-8 text-green-600 transition-all border border-green-200 rounded-lg shadow-sm cursor-pointer bg-green-50 hover:bg-green-600 hover:text-white hover:border-green-600"
                            title="Approve"
                          >
                            <FaCheck className="text-xs" />
                          </button>

                          {/* Reject */}
                          <button
                            onClick={() => handleProductAction("reject", product)}
                            className="inline-flex items-center justify-center w-8 h-8 text-red-500 transition-all border border-red-200 rounded-lg shadow-sm cursor-pointer bg-red-50 hover:bg-red-500 hover:text-white hover:border-red-500"
                            title="Reject"
                          >
                            <FaTimes className="text-xs" />
                          </button>
                        </>
                      )}

                      {/* Resubmission — brand purple */}
                      <button
                        onClick={() => handleProductAction("request_resubmission", product)}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-lg bg-purple-50 border border-purple-200 text-[#852BAF] hover:bg-[#852BAF] hover:text-white hover:border-[#852BAF] transition-all shadow-sm cursor-pointer"
                        title="Request Resubmission"
                      >
                        <FaRedo className="text-xs" />
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(product)}
                        className="inline-flex items-center justify-center w-8 h-8 text-red-500 transition-all border border-red-200 rounded-lg shadow-sm cursor-pointer bg-red-50 hover:bg-red-500 hover:text-white hover:border-red-500"
                        title="Delete"
                      >
                        <FaTrash className="text-xs" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-gray-600">
              Showing{" "}
              <span className="font-semibold">
                {(pagination.currentPage - 1) * pagination.itemsPerPage + 1}
              </span>{" "}
              to{" "}
              <span className="font-semibold">
                {Math.min(
                  pagination.currentPage * pagination.itemsPerPage,
                  pagination.totalItems,
                )}
              </span>{" "}
              of <span className="font-semibold">{pagination.totalItems}</span>{" "}
              products
            </div>

            <div className="flex gap-2">
              {/* Prev */}
              <button
                disabled={pagination.currentPage === 1}
                onClick={() =>
                  setPagination((p) => ({
                    ...p,
                    currentPage: p.currentPage - 1,
                  }))
                }
                className={`px-4 py-2 rounded-lg border text-sm font-medium cursor-pointer ${
                  pagination.currentPage === 1
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-white hover:bg-gray-50"
                }`}
              >
                Previous
              </button>

              {/* Page Numbers */}
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                .slice(
                  Math.max(0, pagination.currentPage - 3),
                  pagination.currentPage + 2,
                )
                .map((page) => (
                  <button
                    key={page}
                    onClick={() =>
                      setPagination((p) => ({ ...p, currentPage: page }))
                    }
                    className={`px-3 py-2 rounded-lg text-sm font-semibold border cursor-pointer ${
                      pagination.currentPage === page
                        ? "bg-[#852BAF] text-white border-[#852BAF]"
                        : "bg-white hover:bg-gray-50"
                    }`}
                  >
                    {page}
                  </button>
                ))}

              {/* Next */}
              <button
                disabled={pagination.currentPage === pagination.totalPages}
                onClick={() =>
                  setPagination((p) => ({
                    ...p,
                    currentPage: p.currentPage + 1,
                  }))
                }
                className={`px-4 py-2 rounded-lg border text-sm font-medium cursor-pointer ${
                  pagination.currentPage === pagination.totalPages
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-white hover:bg-gray-50"
                }`}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* EMPTY STATE */}
        {products.length === 0 && !loading && (
          <div className="py-20 text-center text-gray-500">
            <FaFileAlt className="mx-auto mb-4 text-4xl opacity-20" />
            <p>No products found matching your criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
}
