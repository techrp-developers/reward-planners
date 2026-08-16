import { Link } from "react-router-dom";
import { FiGrid, FiUserCheck, FiArrowRight } from "react-icons/fi";
import { routes } from "../../routes";

export default function RmDashboard() {
  return (
    <div className="w-full min-h-screen">
      <div className="flex items-start mb-8">
        <div className="w-12 h-12 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-full flex items-center justify-center mr-4 shrink-0">
          <FiGrid className="text-xl text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">RM Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Welcome to the RM portal
          </p>
        </div>
      </div>

      <Link
        to={routes.rm.employees}
        className="flex items-center justify-between gap-4 rounded-2xl border border-purple-100 bg-white p-6 shadow-sm transition hover:shadow-md sm:max-w-md"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#852BAF] to-[#FC3F78] text-white shadow-lg shadow-purple-200">
            <FiUserCheck size={20} />
          </div>
          <div>
            <p className="font-bold text-gray-900">Employees</p>
            <p className="text-xs text-gray-500">View companies and registered employees</p>
          </div>
        </div>
        <FiArrowRight className="text-gray-400" />
      </Link>
    </div>
  );
}
