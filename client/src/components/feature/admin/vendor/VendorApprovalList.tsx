"use client";

import { useState, useEffect } from "react";
import {
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
  FaEye,
  FaFileAlt,
  FaSearch,
} from "react-icons/fa";
import { FiUsers } from "react-icons/fi";
import { Link } from "react-router-dom";

interface VendorItem {
  vendor_id: number;
  company_name: string;
  full_name: string;
  status: "sent_for_approval" | "approved" | "rejected";
  rejection_reason?: string;
  email: string;
  phone?: string;
  submitted_at: string;
}

type VendorFilter = "All" | "sent_for_approval" | "approved" | "rejected";

// const API_BASE = import.meta.env.VITE_API_URL;
import { api } from "../../../../api/api";

const StatusChip = ({ status }: { status: VendorItem["status"] }) => {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold border rounded-full text-emerald-700 bg-emerald-50 border-emerald-200">
        <FaCheckCircle className="mr-1" /> Approved
      </span>
    );
  }

  if (status === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold border rounded-full text-rose-700 bg-rose-50 border-rose-200">
        <FaTimesCircle className="mr-1" /> Rejected
      </span>
    );
  }

  if (status === "sent_for_approval") {
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold border rounded-full text-amber-700 bg-amber-50 border-amber-200">
        <FaClock className="mr-1" /> Pending
      </span>
    );
  }

  return null;
};

export default function VendorApprovalList() {
  const [vendors, setVendors] = useState<VendorItem[]>([]);
  const [filter, setFilter] = useState<VendorFilter>("All");
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

  /* ============================
          FETCH VENDORS
  ============================= */
  useEffect(() => {
    async function fetchVendors() {
      try {
        const res = await api.get("/manager/all-vendors");

        if (res.data.success) {
          setVendors(res.data.data);
        }
      } catch (err) {
        console.error("Error loading vendors:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchVendors();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.toLowerCase());
    }, 300);

    return () => clearTimeout(t);
  }, [search]);

  const handleDownloadVendorReport = async () => {
    try {
      const response = await api.get("/manager/download-vendor-report", {
        params: {
          status: filter !== "All" ? filter : "",
          from_date: fromDate || "",
          to_date: toDate || "",
        },
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

  if (loading) return <p className="p-10 text-center">Loading vendors...</p>;

  return (
    <div className="min-h-full bg-linear-to-b from-[#f8f5ff] via-[#fbf9ff] to-[#f7f8fc] p-1 md:p-2">
      <div className="w-full rounded-2xl border border-[#efe7ff] bg-white/95 p-4 shadow-[0_10px_30px_-12px_rgba(133,43,175,0.25)] backdrop-blur-sm md:p-5">
        {/* HEADER */}
        <div className="flex flex-col justify-between gap-4 pb-4 mb-5 border-b border-gray-100 md:flex-row md:items-center">
          <div className="flex items-center">
            <div className="mr-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-r from-[#852BAF] to-[#FC3F78] shadow-lg shadow-fuchsia-200">
              <FiUsers className="text-xl text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
                Vendor Approval Queue
              </h1>
              <p className="text-sm text-gray-600 md:text-base">
                Review and process vendor onboarding submissions
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="px-3 py-2 text-center border border-gray-200 rounded-xl bg-gray-50">
              <p className="text-xs text-gray-500">All</p>
              <p className="text-lg font-bold text-gray-800">{vendors.length}</p>
            </div>
            <div className="px-3 py-2 text-center border rounded-xl border-amber-200 bg-amber-50">
              <p className="text-xs text-amber-700">Pending</p>
              <p className="text-lg font-bold text-amber-700">
                {vendors.filter((v) => v.status === "sent_for_approval").length}
              </p>
            </div>
            <div className="px-3 py-2 text-center border rounded-xl border-emerald-200 bg-emerald-50">
              <p className="text-xs text-emerald-700">Approved</p>
              <p className="text-lg font-bold text-emerald-700">
                {vendors.filter((v) => v.status === "approved").length}
              </p>
            </div>
            <div className="px-3 py-2 text-center border rounded-xl border-rose-200 bg-rose-50">
              <p className="text-xs text-rose-700">Rejected</p>
              <p className="text-lg font-bold text-rose-700">
                {vendors.filter((v) => v.status === "rejected").length}
              </p>
            </div>
          </div>
        </div>

        {/* FILTER */}
        {/* FILTER + SEARCH ROW */}
        <div className="flex flex-col gap-3 mb-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Tabs */}
          <div className="flex flex-wrap gap-2 rounded-xl bg-gray-50 p-1.5">
            {[
              { label: "All", value: "All" },
              { label: "Pending", value: "sent_for_approval" },
              { label: "Approved", value: "approved" },
              { label: "Rejected", value: "rejected" },
            ].map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setFilter(value as VendorFilter)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition cursor-pointer ${
                  filter === value
                    ? "bg-white text-[#852BAF] shadow-sm"
                    : "text-gray-600 hover:bg-white hover:text-gray-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative w-full lg:w-auto">
            <input
              type="text"
              placeholder="Search vendors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm outline-none transition focus:border-[#852BAF] focus:ring-2 focus:ring-[#852BAF]/20 lg:w-80"
            />
            <FaSearch className="absolute text-gray-400 left-3 top-3" />
          </div>
        </div>

        {/* REPORT FILTERS */}
        <div className="flex flex-col gap-3 p-3 mb-4 border border-gray-200 rounded-xl bg-gray-50/80 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            {/* STATUS (reuse existing filter) */}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as VendorFilter)}
              className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#852BAF]"
            >
              <option value="All">All Status</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="sent_for_approval">Pending</option>
            </select>

            {/* DATE FILTER */}
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

          {/* DOWNLOAD BUTTON */}
          <button
            onClick={handleDownloadVendorReport}
            disabled={!fromDate && !toDate && filter === "All"}
            className="cursor-pointer rounded-xl bg-linear-to-r from-[#852BAF] to-[#FC3F78] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-fuchsia-200 transition hover:scale-[1.01] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            Download Report
          </button>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-2xl">
          <table className="min-w-full mt-1 divide-y divide-gray-200">
            <thead className="bg-linear-to-r from-[#f8f2ff] to-[#fff4f8]">
              <tr>
                <th className="px-6 py-3 text-xs font-semibold tracking-wider text-left text-gray-600 uppercase">
                  Vendor
                </th>
                <th className="px-6 py-3 text-xs font-semibold tracking-wider text-left text-gray-600 uppercase">
                  Email / Phone
                </th>
                <th className="px-6 py-3 text-xs font-semibold tracking-wider text-left text-gray-600 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-xs font-semibold tracking-wider text-left text-gray-600 uppercase">
                  Action
                </th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {filteredVendors.map((v) => (
                <tr key={v.vendor_id} className="transition hover:bg-[#fcfaff]">
                  {/* Vendor Info */}
                  <td className="px-6 py-4">
                    <div className="text-sm font-semibold text-gray-900">
                      {v.company_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      Owner: {v.full_name}
                    </div>
                    <div className="text-xs text-gray-500">
                      {v.submitted_at}
                    </div>
                  </td>

                  {/* Contact */}
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-800">{v.email}</div>
                    <div className="text-xs text-gray-600">
                      {v.phone || "No phone"}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4">
                    <StatusChip status={v.status} />
                    {v.status === "rejected" && v.rejection_reason && (
                      <p className="mt-1 text-xs text-red-600">
                        {v.rejection_reason}
                      </p>
                    )}
                  </td>

                  {/* Action */}
                  <td className="px-6 py-4">
                    <Link to={`/manager/vendor-review/${v.vendor_id}`}>
                      <button className="flex cursor-pointer items-center rounded-lg bg-[#852BAF] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-linear-to-r hover:from-[#852BAF] hover:to-[#FC3F78]">
                        <FaEye className="mr-2" /> Review
                      </button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredVendors.length === 0 && (
          <div className="text-center py-14">
            <div className="flex items-center justify-center mx-auto mb-4 bg-gray-100 h-14 w-14 rounded-2xl">
              <FaFileAlt className="text-2xl text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              No Vendors Found
            </h3>
            <p className="text-sm text-gray-500">No match for current filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
