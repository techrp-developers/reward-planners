"use client";

import { useState, useEffect } from "react";
import {
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaEye,
  FaFileAlt,
} from "react-icons/fa";
import { FiCalendar, FiDownload, FiSearch, FiUsers, FiX } from "react-icons/fi";
import { Link } from "react-router-dom";
import Swal from "sweetalert2";
import { api } from "../../../common/api/api";
import { useDebounce } from "../../../common/hooks/useDebounce";
import { confirmDialog } from "../../../common/utils/confirmDialog";

interface VendorItem {
  vendor_id: number;
  company_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  status: "sent_for_approval" | "approved" | "rejected" | "resubmission" | "deleted";
  rejection_reason?: string | null;
  submitted_at: string;
}

type FilterValue =
  | "All"
  | "sent_for_approval"
  | "approved"
  | "rejected"
  | "resubmission"
  | "deleted";

const StatusChip = ({ status }: { status: VendorItem["status"] }) => {
  const map: Record<
    VendorItem["status"],
    { label: string; cls: string; icon: React.ReactNode }
  > = {
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
    resubmission: {
      label: "Resubmission",
      cls: "bg-amber-50 text-amber-700 border border-amber-200",
      icon: <FaClock className="shrink-0" size={11} />,
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
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${cfg.cls}`}
    >
      {cfg.icon} {cfg.label}
    </span>
  );
};

const filterTabs: { label: string; value: FilterValue }[] = [
  { label: "All", value: "All" },
  { label: "Pending", value: "sent_for_approval" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Resubmission", value: "resubmission" },
  { label: "Inactive", value: "deleted" },
];

export default function VendorApprovalList() {
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [filter, setFilter] = useState<FilterValue>("All");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search.toLowerCase(), 300);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportDownloading, setReportDownloading] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const [reportStatus, setReportStatus] = useState<FilterValue>("All");

  const filteredVendors = vendors.filter((v) => {
    const matchesStatus = filter === "All" ? true : v.status === filter;

    const matchesSearch =
      (v.company_name ?? "").toLowerCase().includes(debouncedSearch) ||
      (v.full_name ?? "").toLowerCase().includes(debouncedSearch) ||
      (v.email ?? "").toLowerCase().includes(debouncedSearch) ||
      (v.phone ?? "").toLowerCase().includes(debouncedSearch);

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

  const handleDownloadVendorReport = async () => {
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
      const response = await api.get("/manager/download-vendor-report", {
        params: {
          status: reportStatus !== "All" ? reportStatus : undefined,
          search: reportSearch.trim() || undefined,
          fromDate: fromDate || undefined,
          toDate: toDate || undefined,
        },
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `vendor_report_${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setReportModalOpen(false);
      await Swal.fire({ icon: "success", title: "Report downloaded", text: "Your filtered vendor report is ready.", timer: 1800, showConfirmButton: false });
    } catch (error) {
      console.error("Download failed", error);
      await Swal.fire("Download failed", "Unable to generate the vendor report. Please try again.", "error");
    } finally {
      setReportDownloading(false);
    }
  };

  const handleDeleteVendor = async (vendorId: number) => {
    const confirmed = await confirmDialog({
      title: "Deactivate Vendor?",
      text: "This vendor will be marked as inactive and lose portal access.",
      confirmButtonText: "Deactivate",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#DC2626",
      cancelButtonColor: "#9CA3AF",
      reverseButtons: true,
      customClass: { popup: "rounded-2xl" },
    });

    if (!confirmed) return;

    try {
      const res = await api.put(`/manager/deactivate/${vendorId}`);
      if (res.data) {
        setVendors((prev) =>
          prev.map((v) =>
            v.vendor_id === vendorId ? { ...v, status: "deleted" } : v,
          ),
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
        <span className="ml-4 font-medium text-gray-500">Loading vendors…</span>
      </div>
    );
  }

  const inputCls =
    "px-4 py-2.5 bg-gray-50/60 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:ring-4 focus:ring-[#852BAF]/15 focus:border-[#852BAF] focus:bg-white transition-all";

  return (
    <div className="mx-auto space-y-6 max-w-7xl">
      {reportModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !reportDownloading) setReportModalOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="vendor-report-title" className="w-full max-w-xl overflow-hidden rounded-3xl border border-white/70 bg-white shadow-[0_28px_90px_rgba(39,20,58,0.3)]">
            <div className="relative overflow-hidden bg-gradient-to-br from-[#25103d] via-[#64248c] to-[#b72f72] px-6 py-6 text-white"><div className="absolute -right-10 -top-16 h-40 w-40 rounded-full bg-white/10 blur-2xl" /><div className="relative flex items-start justify-between gap-4"><div className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/15 bg-white/10"><FiDownload size={21} /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-purple-200">Vendor analytics</p><h2 id="vendor-report-title" className="mt-1 text-xl font-extrabold">Download vendor report</h2><p className="mt-1 text-xs text-purple-100/75">Export vendor onboarding data matching your selection.</p></div></div><button type="button" disabled={reportDownloading} onClick={() => setReportModalOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-white/10 transition hover:bg-white/20" aria-label="Close"><FiX /></button></div></div>
            <div className="space-y-5 p-6">
              <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="vendor-report-search" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Vendor or company</label><div className="relative"><FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input id="vendor-report-search" value={reportSearch} onChange={(event) => setReportSearch(event.target.value)} placeholder="All vendors" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-purple-400 focus:bg-white focus:ring-4 focus:ring-purple-100" /></div></div><div><label htmlFor="vendor-report-status" className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">Onboarding status</label><select id="vendor-report-status" value={reportStatus} onChange={(event) => setReportStatus(event.target.value as FilterValue)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-purple-400 focus:bg-white focus:ring-4 focus:ring-purple-100"><option value="All">All statuses</option><option value="sent_for_approval">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="resubmission">Resubmission</option><option value="deleted">Inactive</option></select></div></div>
              <div className="rounded-2xl border border-purple-100 bg-purple-50/50 p-4"><div className="mb-3 flex items-center gap-2"><FiCalendar className="text-[#852BAF]" /><div><p className="text-sm font-extrabold text-slate-800">Custom period</p><p className="text-xs text-slate-500">Filter by vendor registration date.</p></div></div><div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="vendor-report-from" className="mb-1.5 block text-xs font-semibold text-slate-500">From date</label><input id="vendor-report-from" type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} className="w-full rounded-xl border border-purple-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100" /></div><div><label htmlFor="vendor-report-to" className="mb-1.5 block text-xs font-semibold text-slate-500">To date</label><input id="vendor-report-to" type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} className="w-full rounded-xl border border-purple-100 bg-white px-3 py-2.5 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100" /></div></div></div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between"><button type="button" disabled={reportDownloading} onClick={() => { setReportSearch(""); setReportStatus("All"); setFromDate(""); setToDate(""); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-500 transition hover:bg-slate-50">Clear filters</button><button type="button" disabled={reportDownloading} onClick={() => void handleDownloadVendorReport()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-purple-500/20 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60">{reportDownloading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> Generating...</> : <><FiDownload /> Download Excel</>}</button></div>
            </div>
          </div>
        </div>
      )}
      {/* ── PAGE HEADER ── */}
      <div
        className="flex items-center justify-between p-5 rounded-2xl"
        style={{
          background:
            "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex items-center justify-center text-white w-11 h-11 rounded-2xl shrink-0"
            style={{
              background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
              boxShadow: "0 6px 20px rgba(133,43,175,0.25)",
            }}
          >
            <FiUsers size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">
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
            {filteredVendors.length} vendor
            {filteredVendors.length !== 1 ? "s" : ""}
          </span>
          <button type="button" onClick={() => { setReportSearch(search); setReportStatus(filter); setReportModalOpen(true); }} className="inline-flex items-center gap-2 rounded-xl border border-purple-200 bg-white px-4 py-2.5 text-sm font-bold text-[#852BAF] shadow-sm transition hover:-translate-y-0.5 hover:border-[#852BAF] hover:bg-purple-50 hover:shadow-md"><FiDownload /> Vendor report</button>
        </div>
      </div>

      {/* ── MAIN CARD ── */}
      <div
        className="overflow-hidden bg-white rounded-2xl vendor-section-card"
        style={{
          border: "1px solid rgba(133,43,175,0.08)",
          boxShadow: "0 4px 24px rgba(133,43,175,0.06)",
        }}
      >
        {/* FILTER BAR */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Status Tabs */}
            <div
              className="flex gap-1 p-1 rounded-xl"
              style={{
                background: "rgba(133,43,175,0.04)",
                border: "1px solid rgba(133,43,175,0.08)",
              }}
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
                      ? {
                          background:
                            "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
                        }
                      : {}
                  }
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <FiSearch
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                size={14}
              />
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

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr
                style={{
                  background:
                    "linear-gradient(90deg, rgba(133,43,175,0.04) 0%, rgba(252,63,120,0.02) 100%)",
                }}
              >
                <th className="px-6 py-4 text-xs font-bold tracking-wider text-left text-gray-400 uppercase">
                  Vendor
                </th>
                <th className="px-6 py-4 text-xs font-bold tracking-wider text-left text-gray-400 uppercase">
                  Contact
                </th>
                <th className="px-6 py-4 text-xs font-bold tracking-wider text-left text-gray-400 uppercase">
                  Status
                </th>
                <th className="px-6 py-4 text-xs font-bold tracking-wider text-left text-gray-400 uppercase">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {filteredVendors.map((v, i) => (
                <tr
                  key={v.vendor_id}
                  className="transition-colors duration-150 row-animate hover:bg-purple-50/20"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="flex items-center justify-center text-sm font-bold text-white w-9 h-9 rounded-xl shrink-0"
                        style={{
                          background:
                            "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
                        }}
                      >
                        {v.company_name?.charAt(0).toUpperCase() ?? "?"}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          <p>{v.company_name ?? "N/A"}</p>
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          <p>Owner: {v.full_name ?? "N/A"}</p>
                        </p>
                        <p className="text-xs text-gray-400">
                          {v.submitted_at}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-700">{v.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {v.phone || "No phone"}
                    </p>
                  </td>

                  <td className="px-6 py-4">
                    <StatusChip status={v.status} />
                    {(v.status === "rejected" || v.status === "resubmission") && v.rejection_reason && (
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
                            style={{
                              background:
                                "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
                            }}
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
                      <span className="text-xs italic text-gray-400">
                        No actions available
                      </span>
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
              className="flex items-center justify-center w-16 h-16 mx-auto mb-4 rounded-2xl"
              style={{
                background:
                  "linear-gradient(135deg, rgba(133,43,175,0.08) 0%, rgba(252,63,120,0.05) 100%)",
              }}
            >
              <FaFileAlt className="text-[#852BAF] opacity-50" size={24} />
            </div>
            <h3 className="mb-1 text-base font-bold text-gray-700">
              No Vendors Found
            </h3>
            <p className="text-sm text-gray-400">
              No match for the current filter or search.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
