import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiHeart, FiPlus } from "react-icons/fi";
import { useServicePartnerRoutes } from "../../shared/useModuleRoutes";
import { useServicePartners, defaultServicePartnerFilters } from "../store/useServicePartners";
import ServicePartnerFilters from "../components/ServicePartnerFilters";
import ServicePartnerTable from "../components/ServicePartnerTable";

const PAGE_SIZE = 10;

export default function ServicePartnerList() {
  const [searchParams] = useSearchParams();
  const categoryFromUrl = searchParams.get("category");
  const servicePartnerRoutes = useServicePartnerRoutes();

  const { filteredPartners, loading, filters, setFilters, cities } = useServicePartners({
    category: categoryFromUrl ?? defaultServicePartnerFilters.category,
  });
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(filteredPartners.length / PAGE_SIZE));
  const paginated = filteredPartners.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
        <span className="ml-4 text-gray-500 font-medium">Loading service partners…</span>
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
        <div className="flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0"
            style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 6px 20px rgba(133,43,175,0.25)" }}
          >
            <FiHeart size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">
              Service <span className="gradient-text-brand">Partners</span>
            </h1>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Manage onboarded service partners across all categories
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-500"
            style={{ background: "rgba(133,43,175,0.07)", color: "#852BAF" }}
          >
            {filteredPartners.length} partner{filteredPartners.length !== 1 ? "s" : ""}
          </span>
          <Link to={servicePartnerRoutes.onboard}>
            <button
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white cursor-pointer transition-all hover:opacity-90 active:scale-95"
              style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
            >
              <FiPlus size={14} /> Add Partner
            </button>
          </Link>
        </div>
      </div>

      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}
      >
        <ServicePartnerFilters filters={filters} onChange={setFilters} cities={cities} />
        <ServicePartnerTable partners={paginated} />
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Showing <span className="font-semibold">{(currentPage - 1) * PAGE_SIZE + 1}</span> to{" "}
            <span className="font-semibold">{Math.min(currentPage * PAGE_SIZE, filteredPartners.length)}</span> of{" "}
            <span className="font-semibold">{filteredPartners.length}</span> partners
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
