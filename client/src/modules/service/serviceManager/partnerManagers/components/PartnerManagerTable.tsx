import { Link } from "react-router-dom";
import { FaEdit, FaFileAlt } from "react-icons/fa";
import { usePartnerManagerRoutes } from "../../shared/useModuleRoutes";
import type { PartnerManager } from "../types";

export default function PartnerManagerTable({ managers }: { managers: PartnerManager[] }) {
  const partnerManagerRoutes = usePartnerManagerRoutes();

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
              Manager
            </th>
            <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
              Region
            </th>
            <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
              Assigned Partners
            </th>
            <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-50">
          {managers.map((m, i) => (
            <tr
              key={m.managerId}
              className="row-animate hover:bg-purple-50/20 transition-colors duration-150"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white text-sm shrink-0"
                    style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
                  >
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{m.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{m.managerId}</p>
                  </div>
                </div>
              </td>

              <td className="px-6 py-4 text-sm text-gray-700">{m.region}</td>

              <td className="px-6 py-4">
                <span
                  className="px-3 py-1 rounded-lg text-xs font-bold"
                  style={{ background: "rgba(133,43,175,0.07)", color: "#852BAF" }}
                >
                  {m.assignedPartners.length} partner{m.assignedPartners.length !== 1 ? "s" : ""}
                </span>
              </td>

              <td className="px-6 py-4">
                <Link to={partnerManagerRoutes.edit.replace(":id", m.managerId)}>
                  <button
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white rounded-xl cursor-pointer transition-all hover:opacity-90 active:scale-95"
                    style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
                  >
                    <FaEdit size={11} /> Edit
                  </button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {managers.length === 0 && (
        <div className="py-16 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{
              background: "linear-gradient(135deg, rgba(133,43,175,0.08) 0%, rgba(252,63,120,0.05) 100%)",
            }}
          >
            <FaFileAlt className="text-[#852BAF] opacity-50" size={24} />
          </div>
          <h3 className="text-base font-bold text-gray-700 mb-1">No Partner Managers Found</h3>
        </div>
      )}
    </div>
  );
}
