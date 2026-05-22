"use client";

import React, { useEffect, useState, useCallback } from "react";
import Swal from "../../../../utils/swalFallback";
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
import { FiBox } from "react-icons/fi";
import { routes } from "../../../../routes";
import { api } from "../../../../api/api";

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

type SortColumn = "product_id" | "product_name";

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
      className={`relative overflow-hidden rounded-2xl border border-white/20 p-5 text-white shadow-lg bg-linear-to-br ${color}`}
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
};

/* ================================
       MAIN COMPONENT
================================ */
export default function ProductManagerList() {
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

  const [stats, setStats] = useState<Stats>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    resubmission: 0,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
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
    "hover:bg-linear-to-r hover:from-[#852BAF] hover:to-[#FC3F78] active:scale-95";

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
    sortBy,
    sortOrder,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProducts();
    }, 400);

    return () => clearTimeout(timer);
  }, [
    pagination.currentPage,
    pagination.itemsPerPage,
    searchQuery,
    statusFilter,
    sortBy,
    sortOrder,
    fetchProducts,
  ]);

  const handleDelete = async (product: ProductItem) => {
    const result = await Swal.fire({
      title: "Delete Product?",
      text: `Are you sure you want to delete "${product.product_name}"?`,
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
        `/product/remove-product/${product.product_id}`,
      );

      if (!res.data.success) {
        throw new Error(res.data.message || "Delete failed");
      }

      // Option 1: Refetch (simple + safe)
      await fetchProducts();

      await Swal.fire({
        title: "Deleted!",
        text: "Product deleted successfully.",
        icon: "success",
        timer: 1200,
        showConfirmButton: false,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to delete product.";
      await Swal.fire({
        title: "Error",
        text: message,
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
      preConfirm: (value: unknown) => {
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

      await fetchProducts();

      await Swal.fire({
        title: "Success!",
        text: res.data.message || "Action completed successfully.",
        icon: "success",
        timer: 1400,
        showConfirmButton: false,
        customClass: { popup: "rounded-2xl" },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Something went wrong.";
      await Swal.fire({
        title: "Failed",
        text: message,
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
    try {
      const response = await api.get("/product/download-product-report", {
        params: {
          vendorId: vendorFilter,
          fromDate,
          toDate,
        },
        responseType: "blob",
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;

      link.setAttribute("download", "product_report.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Download failed", error);
    }
  };

  const onSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
      setPagination((prev) => ({ ...prev, currentPage: 1 }));
    },
    [],
  );

  return (
    <div className="min-h-full bg-linear-to-b from-[#f8f5ff] via-[#fbf9ff] to-[#f7f8fc] p-1 md:p-2">
      <div className="w-full rounded-2xl border border-[#efe7ff] bg-white/95 p-4 shadow-[0_10px_30px_-12px_rgba(133,43,175,0.25)] backdrop-blur-sm md:p-5">
        <div className="mb-6 mt-1 flex items-start gap-3 border-b border-gray-100 pb-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-r from-[#852BAF] to-[#FC3F78] shadow-lg shadow-fuchsia-200">
            <FiBox className="text-xl text-white" />
          </div>

          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
              Product Approval Queue
            </h2>
            <p className="mt-1 text-sm text-gray-600 md:text-base">
              Manage approvals, resubmissions, and product moderation in one place.
            </p>
          </div>
        </div>
        {/* STATS CARDS */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            title="Total Products"
            value={stats.total}
            icon={FaFileAlt}
            color="from-violet-600 to-fuchsia-600"
          />
          <StatCard
            title="Pending for Review"
            value={stats.pending}
            icon={FaClock}
            color="from-amber-500 to-orange-600"
          />
          <StatCard
            title="Approved"
            value={stats.approved}
            icon={FaCheckCircle}
            color="from-emerald-500 to-green-700"
          />
          <StatCard
            title="Rejected"
            value={stats.rejected}
            icon={FaTimesCircle}
            color="from-rose-500 to-red-700"
          />
          <StatCard
            title="Need Resubmission"
            value={stats.resubmission}
            icon={FaRedo}
            color="from-sky-500 to-blue-700"
          />
        </div>

        {/* FILTERS + SEARCH */}
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={onSearchChange}
              placeholder="Search products..."
              className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none transition focus:border-[#852BAF] focus:ring-2 focus:ring-[#852BAF]/20"
            />
            <FaSearch className="absolute text-gray-400 pointer-events-none left-3 top-3" />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPagination((p) => ({ ...p, currentPage: 1 }));
            }}
            className="cursor-pointer rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#852BAF] focus:ring-2 focus:ring-[#852BAF]/20"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="resubmission">Resubmission</option>
          </select>
        </div>

        {/* REPORT DOWNLOAD SECTION */}
        <div className="mb-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/80 p-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#852BAF]"
            >
              <option value="">All Vendors</option>
              {vendors.map((vendor) => (
                <option key={vendor.vendor_id} value={vendor.vendor_id}>
                  {vendor.full_name}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#852BAF]"
            />

            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#852BAF]"
            />
          </div>

          <button
            onClick={handleDownloadReport}
            className="cursor-pointer rounded-xl bg-linear-to-r from-[#852BAF] to-[#FC3F78] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-fuchsia-200 transition hover:scale-[1.01] hover:shadow-lg"
          >
            Download Report
          </button>
        </div>

        {/* TABLE */}
        <div className="relative overflow-x-auto bg-white border border-gray-200 rounded-2xl">
          {/*  Loading overlay (focus never breaks) */}
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
              <FaSpinner className="animate-spin text-3xl text-[#852BAF]" />
            </div>
          )}

          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-linear-to-r from-[#f8f2ff] to-[#fff4f8]">
              <tr>
                {/* NEW: Product ID column */}
                <th
                  onClick={() => handleSort("product_id")}
                  className="px-4 py-3 text-xs font-semibold tracking-wider text-left text-gray-600 uppercase cursor-pointer"
                >
                  <div className="flex items-center">
                    Product ID {getSortIcon("product_id")}
                  </div>
                </th>

                <th
                  onClick={() => handleSort("product_name")}
                  className="px-4 py-3 text-xs font-semibold tracking-wider text-left text-gray-600 uppercase cursor-pointer"
                >
                  <div className="flex items-center">
                    Product {getSortIcon("product_name")}
                  </div>
                </th>

                <th className="px-4 py-3 text-xs font-semibold tracking-wider text-left text-gray-600 uppercase">
                  Brand
                </th>

                <th className="px-4 py-3 text-xs font-semibold tracking-wider text-left text-gray-600 uppercase">
                  Status
                </th>

                <th className="px-4 py-3 pl-0 text-xs font-semibold tracking-wider text-left text-gray-600 uppercase">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {products.map((product) => (
                <tr key={product.product_id} className="transition hover:bg-[#fcfaff]">
                  {/* NEW: Product ID cell */}
                  <td className="px-4 py-4 font-medium text-gray-600">
                    <Link
                      to={routes.manager.productView.replace(
                        ":id",
                        product.product_id.toString(),
                      )}
                      className="rounded-lg bg-gray-100 px-2 py-1.5 text-sm text-gray-700 transition hover:bg-gray-200"
                      title="View"
                    >
                      {"PRD -"} {product.product_id}
                    </Link>
                  </td>

                  <td className="px-4 py-4 font-medium">
                    <Link
                      to={routes.manager.productView.replace(
                        ":id",
                        product.product_id.toString(),
                      )}
                      className="text-gray-900 hover:text-[#852BAF]"
                      title="View"
                    >
                      {product.product_name}
                    </Link>
                  </td>

                  <td className="px-4 py-4 text-left text-gray-700">
                    {product.brand_name}
                  </td>

                  <td className="px-4 py-4 text-left">
                    <StatusChip status={product.status} />
                  </td>

                  <td className="px-4 py-4 align-top">
                    <div className="flex justify-start">
                      <div className="flex gap-2 overflow-x-auto max-w-40 scrollbar-thin">
                        <Link
                          to={routes.manager.productView.replace(
                            ":id",
                            product.product_id.toString(),
                          )}
                          className="inline-flex items-center justify-center text-gray-700 transition bg-gray-100 rounded-lg h-9 w-9 shrink-0 hover:bg-gray-200"
                          title="View"
                        >
                          <FaEye />
                        </Link>

                        {product.status === "pending" && (
                          <>
                            <button
                              onClick={() =>
                                handleProductAction("approve", product)
                              }
                              className="inline-flex items-center justify-center transition rounded-lg cursor-pointer h-9 w-9 bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              title="Approve"
                            >
                              <FaCheck />
                            </button>

                            <button
                              onClick={() =>
                                handleProductAction("reject", product)
                              }
                              className="inline-flex items-center justify-center transition rounded-lg cursor-pointer h-9 w-9 bg-rose-100 text-rose-700 hover:bg-rose-200"
                              title="Reject"
                            >
                              <FaTimes />
                            </button>
                          </>
                        )}

                        <button
                          onClick={() =>
                            handleProductAction("request_resubmission", product)
                          }
                          className="inline-flex items-center justify-center transition rounded-lg cursor-pointer h-9 w-9 bg-sky-100 text-sky-700 hover:bg-sky-200"
                          title="Resubmission"
                        >
                          <FaRedo />
                        </button>

                        <button
                          onClick={() => handleDelete(product)}
                          className="inline-flex items-center justify-center transition rounded-lg cursor-pointer h-9 w-9 bg-rose-100 text-rose-700 hover:bg-rose-200"
                          title="Delete"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        {pagination.totalPages > 1 && (
          <div className="flex flex-col gap-3 p-3 mt-6 border border-gray-200 rounded-2xl bg-gray-50/80 md:flex-row md:items-center md:justify-between">
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
                    : "bg-white hover:bg-[#f6f0ff]"
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
                        ? "bg-[#852BAF] text-white border-[#852BAF] shadow-sm"
                        : "bg-white hover:bg-[#f6f0ff]"
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
                    : "bg-white hover:bg-[#f6f0ff]"
                }`}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* EMPTY STATE */}
        {products.length === 0 && !loading && (
          <div className="text-center py-14">
            <div className="flex items-center justify-center mx-auto mb-4 bg-gray-100 h-14 w-14 rounded-2xl">
              <FaFileAlt className="text-2xl text-gray-400" />
            </div>
            <p className="text-sm text-gray-500">No products found matching your criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
}
