"use client";

import { useState, useEffect } from "react";
import {
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaEye,
  FaFileAlt,
  FaDownload,
} from "react-icons/fa";
import { FiUsers, FiSearch } from "react-icons/fi";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { api } from "../../../../api/api";

interface VendorItem {
  vendor_id: number;
  company_name: string;
  full_name: string;
  status: "sent_for_approval" | "approved" | "rejected" | "deleted";
  rejection_reason?: string;
  email: string;
  phone?: string;
  submitted_at: string;
}

type FilterValue = "All" | "sent_for_approval" | "approved" | "rejected" | "deleted";

const StatusChip = ({ status }: { status: VendorItem["status"] }) => {
  const map: Record<VendorItem["status"], { label: string; cls: string; icon: React.ReactNode }> = {
    approved: {
      label: "Approved",
      cls: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      icon: <FaCheckCircle className="shrink-0" size={11} />,
    },
    rejected: {
      label: "Rejected",
      cls: "bg-red-50 text-red-700 border border-red-200",
      icon: <FaTimesCircle className="shrink-0" size={11} />,
    },
    sent_for_approval: {
      label: "Pending",
      cls: "bg-amber-50 text-amber-700 border border-amber-200",
      icon: <FaClock className="shrink-0" size={11} />,
    },
    deleted: {
      label: "Inactive",
      cls: "bg-gray-100 text-gray-500 border border-gray-200",
      icon: <FaTimesCircle className="shrink-0" size={11} />,
    },
  };

  const cfg = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
};

const filterTabs: { label: string; value: FilterValue }[] = [
  { label: "All", value: "All" },
  { label: "Pending", value: "sent_for_approval" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Inactive", value: "deleted" },
];

export default function VendorApprovalList() {
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [filter, setFilter] = useState<FilterValue>("All");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const filteredVendors = vendors.filter((v) => {
    const matchesStatus = filter === "All" ? true : v.status === filter;
    const matchesSearch =
      v.company_name.toLowerCase().includes(debouncedSearch) ||
      v.full_name.toLowerCase().includes(debouncedSearch) ||
      v.email.toLowerCase().includes(debouncedSearch) ||
      (v.phone || "").toLowerCase().includes(debouncedSearch);
    return matchesStatus && matchesSearch;
  });

  useEffect(() => {
    async function fetchVendors() {
      try {
        const res = await api.get("/manager/all-vendors");
        if (res.data.success) setVendors(res.data.data);
      } catch (err) {
        console.error("Error loading vendors:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchVendors();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.toLowerCase()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const handleDownloadVendorReport = async () => {
    try {
      const response = await api.get("/manager/download-vendor-report", {
        params: { status: filter !== "All" ? filter : "" },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "vendor_report.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Download failed", error);
    }
  };

  const handleDeleteVendor = async (vendorId: number) => {
    const result = await Swal.fire({
      title: "Deactivate Vendor?",
      text: "This vendor will be marked as inactive and lose portal access.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Deactivate",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#DC2626",
      cancelButtonColor: "#9CA3AF",
      reverseButtons: true,
      customClass: { popup: "rounded-2xl" },
    });

    if (!result.isConfirmed) return;

    try {
      const res = await api.put(`/manager/deactivate/${vendorId}`);
      if (res.data) {
        setVendors((prev) =>
          prev.map((v) => (v.vendor_id === vendorId ? { ...v, status: "deleted" } : v))
        );
        await Swal.fire({
          title: "Deactivated",
          text: "Vendor has been deactivated.",
          icon: "success",
          timer: 1400,
          showConfirmButton: false,
          customClass: { popup: "rounded-2xl" },
        });
      }
    } catch (err) {
      console.error("Error deleting vendor:", err);
      await Swal.fire({
        title: "Error",
        text: "Failed to deactivate vendor.",
        icon: "error",
        customClass: { popup: "rounded-2xl" },
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
        <span className="ml-4 text-gray-500 font-medium">Loading vendors…</span>
      </div>
    );
  }

  const inputCls = "px-4 py-2.5 bg-gray-50/60 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:ring-4 focus:ring-[#852BAF]/15 focus:border-[#852BAF] focus:bg-white transition-all";

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── PAGE HEADER ── */}
      <div
        className="flex items-center justify-between p-5 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0"
            style={{
              background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
              boxShadow: "0 6px 20px rgba(133,43,175,0.25)",
            }}
          >
            <FiUsers size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              Vendor <span className="gradient-text-brand">Approvals</span>
            </h1>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Review and manage vendor onboarding submissions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
          <span
            className="px-3 py-1.5 rounded-xl"
            style={{ background: "rgba(133,43,175,0.07)", color: "#852BAF" }}
          >
            {filteredVendors.length} vendor{filteredVendors.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* ── MAIN CARD ── */}
      <div
        className="bg-white rounded-2xl vendor-section-card overflow-hidden"
        style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}
      >
        {/* FILTER BAR */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Status Tabs */}
            <div
              className="flex gap-1 p-1 rounded-xl"
              style={{ background: "rgba(133,43,175,0.04)", border: "1px solid rgba(133,43,175,0.08)" }}
            >
              {filterTabs.map(({ label, value }) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 cursor-pointer ${
                    filter === value
                      ? "text-white shadow-sm"
                      : "text-gray-500 hover:text-[#852BAF]"
                  }`}
                  style={
                    filter === value
                      ? { background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }
                      : {}
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input
                type="text"
                placeholder="Search vendors…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${inputCls} pl-9 w-60`}
              />
            </div>
          </div>
        </div>

        {/* REPORT FILTERS */}
        <div
          className="px-6 py-3 flex flex-wrap items-center justify-between gap-3"
          style={{ background: "rgba(133,43,175,0.02)", borderBottom: "1px solid rgba(133,43,175,0.06)" }}
        >
          <div className="flex gap-2 flex-wrap items-center">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterValue)}
              className={`${inputCls} cursor-pointer`}
            >
              <option value="All">All Status</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="deleted">Inactive</option>
              <option value="sent_for_approval">Pending</option>
            </select>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={`${inputCls} cursor-pointer`}
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={`${inputCls} cursor-pointer`}
            />
          </div>

          <button
            onClick={handleDownloadVendorReport}
            disabled={!fromDate && !toDate && filter === "All"}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white cursor-pointer transition-all hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
          >
            <FaDownload size={13} /> Download Report
          </button>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr style={{ background: "linear-gradient(90deg, rgba(133,43,175,0.04) 0%, rgba(252,63,120,0.02) 100%)" }}>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Vendor
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {filteredVendors.map((v, i) => (
                <tr
                  key={v.vendor_id}
                  className="row-animate hover:bg-purple-50/20 transition-colors duration-150"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-sm shrink-0"
                        style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
                      >
                        {v.company_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{v.company_name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Owner: {v.full_name}</p>
                        <p className="text-xs text-gray-400">{v.submitted_at}</p>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-700">{v.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{v.phone || "No phone"}</p>
                  </td>

                  <td className="px-6 py-4">
                    <StatusChip status={v.status} />
                    {v.status === "rejected" && v.rejection_reason && (
                      <p className="mt-1.5 text-xs text-red-500 font-medium max-w-45">
                        {v.rejection_reason}
                      </p>
                    )}
                  </td>

                  <td className="px-6 py-4">
                    {v.status !== "deleted" ? (
                      <div className="flex items-center gap-2">
                        <Link to={`/manager/vendor-review/${v.vendor_id}`}>
                          <button
                            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white rounded-xl cursor-pointer transition-all hover:opacity-90 active:scale-95"
                            style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
                          >
                            <FaEye size={11} /> Review
                          </button>
                        </Link>
                        <button
                          onClick={() => handleDeleteVendor(v.vendor_id)}
                          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl cursor-pointer transition-all active:scale-95"
                        >
                          <FaTimesCircle size={11} /> Deactivate
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">No actions available</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* EMPTY STATE */}
        {filteredVendors.length === 0 && (
          <div className="py-16 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "linear-gradient(135deg, rgba(133,43,175,0.08) 0%, rgba(252,63,120,0.05) 100%)" }}
            >
              <FaFileAlt className="text-[#852BAF] opacity-50" size={24} />
            </div>
            <h3 className="text-base font-bold text-gray-700 mb-1">No Vendors Found</h3>
            <p className="text-sm text-gray-400">No match for the current filter or search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
