import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiSearch, FiPlus, FiEdit, FiTrash2 } from "react-icons/fi";
import { FaFileAlt } from "react-icons/fa";
import { routes } from "../../../../../routes";
import { confirmDialog } from "../../../../../common/utils/confirmDialog";
import { useMyServices } from "../../store/useMyServices";
import { ServiceStatusChip } from "../../components/StatusChips";

const inputCls =
  "px-4 py-2.5 bg-gray-50/60 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:ring-4 focus:ring-[#852BAF]/15 focus:border-[#852BAF] focus:bg-white transition-all";

const PAGE_SIZE = 8;

export default function MyServicesList() {
  const { filteredServices, loading, search, setSearch, statusFilter, setStatusFilter, removeService } =
    useMyServices();
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => setCurrentPage(1), [search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredServices.length / PAGE_SIZE));
  const paginated = filteredServices.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleDelete = async (serviceId: string, name: string) => {
    const confirmed = await confirmDialog({
      title: `Delete "${name}"?`,
      text: "This action cannot be undone.",
      confirmButtonText: "Yes, delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#EF4444",
      cancelButtonColor: "#9CA3AF",
      reverseButtons: true,
    });
    if (!confirmed) return;
    await removeService(serviceId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div
        className="flex items-center justify-between p-5 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
            My <span className="gradient-text-brand">Services</span>
          </h1>
          <p className="text-xs text-gray-500 font-medium mt-0.5">Manage the services you offer</p>
        </div>
        <Link to={routes.servicePartner.services.add}>
          <button
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white cursor-pointer transition-all hover:opacity-90 active:scale-95"
            style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
          >
            <FiPlus size={14} /> Add Service
          </button>
        </Link>
      </div>

      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}
      >
        <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-50">
          <div className="relative">
            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              placeholder="Search services…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputCls} pl-9 w-64`}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className={`${inputCls} cursor-pointer`}
          >
            <option value="All">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr style={{ background: "linear-gradient(90deg, rgba(133,43,175,0.04) 0%, rgba(252,63,120,0.02) 100%)" }}>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Service</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Price</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Discount</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Duration</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.map((s) => (
                <tr key={s.serviceId} className="hover:bg-purple-50/20 transition-colors">
                  <td className="px-6 py-4">
                    <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5 max-w-xs truncate">{s.description}</p>
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-800">₹{s.price.toLocaleString("en-IN")}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{s.discount ? `${s.discount}%` : "—"}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{s.duration}</td>
                  <td className="px-6 py-4">
                    <ServiceStatusChip status={s.status} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Link to={routes.servicePartner.services.edit.replace(":id", s.serviceId)}>
                        <button className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white rounded-xl cursor-pointer transition-all hover:opacity-90 active:scale-95"
                          style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
                        >
                          <FiEdit size={11} /> Edit
                        </button>
                      </Link>
                      <button
                        onClick={() => handleDelete(s.serviceId, s.name)}
                        className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl cursor-pointer transition-all active:scale-95"
                      >
                        <FiTrash2 size={11} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredServices.length === 0 && (
            <div className="py-16 text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: "linear-gradient(135deg, rgba(133,43,175,0.08) 0%, rgba(252,63,120,0.05) 100%)" }}
              >
                <FaFileAlt className="text-[#852BAF] opacity-50" size={24} />
              </div>
              <h3 className="text-base font-bold text-gray-700 mb-1">No Services Found</h3>
              <p className="text-sm text-gray-400">No match for the current filter or search.</p>
            </div>
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing <span className="font-semibold">{(currentPage - 1) * PAGE_SIZE + 1}</span> to{" "}
            <span className="font-semibold">{Math.min(currentPage * PAGE_SIZE, filteredServices.length)}</span> of{" "}
            <span className="font-semibold">{filteredServices.length}</span> services
          </div>
          <div className="flex gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium cursor-pointer ${
                currentPage === 1 ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-white hover:bg-gray-50"
              }`}
            >
              Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold border cursor-pointer ${
                  currentPage === page ? "bg-[#852BAF] text-white border-[#852BAF]" : "bg-white hover:bg-gray-50"
                }`}
              >
                {page}
              </button>
            ))}
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              className={`px-4 py-2 rounded-lg border text-sm font-medium cursor-pointer ${
                currentPage === totalPages ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-white hover:bg-gray-50"
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
