import { Link } from "react-router-dom";
import { FaEye, FaEdit, FaFileAlt, FaStar } from "react-icons/fa";
import { useServicePartnerRoutes } from "../../shared/useModuleRoutes";
import StatusChip from "./StatusChip";
import type { ServicePartner } from "../types";

export default function ServicePartnerTable({ partners }: { partners: ServicePartner[] }) {
  const servicePartnerRoutes = useServicePartnerRoutes();

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr
            style={{
              background: "linear-gradient(90deg, rgba(133,43,175,0.04) 0%, rgba(252,63,120,0.02) 100%)",
            }}
          >
            <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
              Partner
            </th>
            <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
              Category
            </th>
            <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
              City
            </th>
            <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
              Rating
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
          {partners.map((p, i) => (
            <tr
              key={p.partnerId}
              className="row-animate hover:bg-purple-50/20 transition-colors duration-150"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-sm shrink-0"
                    style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
                  >
                    {p.partnerName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{p.partnerName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{p.partnerCode}</p>
                  </div>
                </div>
              </td>

              <td className="px-6 py-4">
                <p className="text-sm text-gray-700">{p.category}</p>
                <p className="text-xs text-gray-400 mt-0.5">{p.subCategory}</p>
              </td>

              <td className="px-6 py-4 text-sm text-gray-700">{p.city}</td>

              <td className="px-6 py-4">
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-700">
                  <FaStar className="text-amber-400" size={12} /> {p.rating.toFixed(1)}
                </span>
              </td>

              <td className="px-6 py-4">
                <StatusChip status={p.status} />
              </td>

              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <Link to={servicePartnerRoutes.profile.replace(":id", p.partnerId)}>
                    <button className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-gray-500 bg-white border border-gray-100 hover:text-[#852BAF] rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer">
                      <FaEye size={11} /> View
                    </button>
                  </Link>
                  <Link to={servicePartnerRoutes.edit.replace(":id", p.partnerId)}>
                    <button
                      className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white rounded-xl cursor-pointer transition-all hover:opacity-90 active:scale-95"
                      style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
                    >
                      <FaEdit size={11} /> Edit
                    </button>
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {partners.length === 0 && (
        <div className="py-16 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{
              background: "linear-gradient(135deg, rgba(133,43,175,0.08) 0%, rgba(252,63,120,0.05) 100%)",
            }}
          >
            <FaFileAlt className="text-[#852BAF] opacity-50" size={24} />
          </div>
          <h3 className="text-base font-bold text-gray-700 mb-1">No Service Partners Found</h3>
          <p className="text-sm text-gray-400">No match for the current filter or search.</p>
        </div>
      )}
    </div>
  );
}
