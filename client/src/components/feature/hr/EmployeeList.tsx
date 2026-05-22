import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  FiSearch,
  FiPlus,
  FiMail,
  FiPhone,
  FiUser,
  FiUserCheck,
  FiClock,
  FiUpload,
  FiArrowLeft,
  FiEdit,
  FiTrash2,
} from "react-icons/fi";

/* ================= TYPES ================= */

type EmployeeStatus = "active" | "pending";
type FilterType = "all" | EmployeeStatus;

interface Employee {
  id: number;
  name: string;
  email: string;
  phone: string;
  department: string;
  role: string;
  status: EmployeeStatus;
  created_at: string;
}

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string; // Unified name
  active?: boolean;
  onClick?: () => void;
}

/* ================= COMPONENT ================= */

export default function EmployeeList() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<FilterType>("all");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      const data: Employee[] = [
        { id: 1, name: "Rahul Sharma", email: "rahul.sharma@company.com", phone: "+91 9876543210", department: "Human Resources", role: "HR Manager", status: "active", created_at: "2025-01-15" },
        { id: 2, name: "Priya Patel", email: "priya.patel@company.com", phone: "+91 9123456780", department: "Engineering", role: "Senior Developer", status: "active", created_at: "2025-01-20" },
        { id: 3, name: "Amit Kumar", email: "amit.kumar@company.com", phone: "+91 9988776655", department: "Marketing", role: "Marketing Lead", status: "pending", created_at: "2025-02-01" },
        { id: 4, name: "Sneha Gupta", email: "sneha.gupta@company.com", phone: "+91 9876543211", department: "Finance", role: "Accountant", status: "active", created_at: "2025-02-05" },
        { id: 5, name: "Vikram Singh", email: "vikram.singh@company.com", phone: "+91 9876543212", department: "Operations", role: "Operations Manager", status: "pending", created_at: "2025-02-10" },
        { id: 6, name: "Anjali Verma", email: "anjali.verma@company.com", phone: "+91 9876543213", department: "IT", role: "System Administrator", status: "active", created_at: "2025-02-15" },
        { id: 7, name: "Rajesh Khanna", email: "rajesh.khanna@company.com", phone: "+91 9876543214", department: "Sales", role: "Sales Executive", status: "pending", created_at: "2025-02-20" },
        { id: 8, name: "Meera Nair", email: "meera.nair@company.com", phone: "+91 9876543215", department: "Customer Support", role: "Support Lead", status: "active", created_at: "2025-02-25" },
      ];
      setEmployees(data);
      setLoading(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const matchSearch =
        emp.name.toLowerCase().includes(search.toLowerCase()) ||
        emp.email.toLowerCase().includes(search.toLowerCase()) ||
        emp.department.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || emp.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [employees, search, statusFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-purple-200 rounded-full border-t-purple-600 animate-spin"></div>
          <p className="font-medium text-gray-500">Loading employees...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      {/* HEADER */}
      <div className="mb-6">
        <Link to="/hr/dashboard" className="inline-flex items-center gap-1 mb-2 text-sm text-gray-500 hover:text-purple-600">
          <FiArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 md:text-3xl">
              Employee <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#852BAF] to-[#FC3F78]">Directory</span>
            </h1>
            <p className="mt-1 text-gray-500">Manage and track all team members</p>
          </div>
          <Link to="/hr/onboarding" className="flex items-center justify-center gap-2 px-5 py-2.5 text-white font-semibold rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-lg shadow-purple-500/30 transition-all duration-300">
            <FiPlus className="w-5 h-5" /> Add Employee
          </Link>
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 gap-4 mb-6 sm:grid-cols-3">
        <StatCard
          label="Total Employees"
          value={employees.length}
          icon={FiUser}
          gradient="from-gray-500 to-gray-700"
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        <StatCard
          label="Active"
          value={employees.filter((e) => e.status === "active").length}
          icon={FiUserCheck}
          gradient="from-emerald-500 to-emerald-700"
          active={statusFilter === "active"}
          onClick={() => setStatusFilter("active")}
        />
        <StatCard
          label="Pending"
          value={employees.filter((e) => e.status === "pending").length}
          icon={FiClock}
          gradient="from-amber-500 to-amber-700"
          active={statusFilter === "pending"}
          onClick={() => setStatusFilter("pending")}
        />
      </div>

      {/* SEARCH & FILTER */}
      <div className="flex flex-col gap-4 mb-6 md:flex-row">
        <div className="relative flex-1">
          <FiSearch className="absolute left-4 top-3.5 text-gray-400 w-5 h-5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or department..."
            className="w-full py-3 pl-12 pr-4 transition-all border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FilterType)}
            className="px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
          </select>
          <button className="flex items-center gap-2 px-4 py-3 transition-colors border border-gray-200 rounded-xl hover:bg-gray-50">
            <FiUpload className="w-5 h-5" /> <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="overflow-hidden bg-white border border-gray-200 shadow-lg rounded-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50">
              <tr className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
                <th className="px-5 py-4">Employee</th>
                <th className="px-5 py-4">Contact</th>
                <th className="px-5 py-4">Department</th>
                <th className="px-5 py-4">Role</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Joined</th>
                <th className="px-5 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <FiUser className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium text-gray-500">No employees found</p>
                  </td>
                </tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 font-bold text-white rounded-full bg-gradient-to-r from-purple-500 to-pink-500">
                          {emp.name.charAt(0)}
                        </div>
                        <span className="font-semibold text-gray-900">{emp.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      <div className="flex items-center gap-2"><FiMail className="w-3.5 h-3.5" /> {emp.email}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-gray-400"><FiPhone className="w-3.5 h-3.5" /> {emp.phone}</div>
                    </td>
                    <td className="px-5 py-4 text-sm font-medium text-gray-700">{emp.department}</td>
                    <td className="px-5 py-4 text-sm text-gray-600">{emp.role}</td>
                    <td className="px-5 py-4"><StatusBadge status={emp.status} /></td>
                    <td className="px-5 py-4 text-sm text-gray-500">{emp.created_at}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button className="p-2 text-gray-400 hover:text-purple-600"><FiEdit className="w-4 h-4" /></button>
                        <button className="p-2 text-gray-400 hover:text-red-600"><FiTrash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ================= HELPER COMPONENTS ================= */

function StatCard({ label, value, icon: Icon, gradient, active, onClick }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl text-white bg-gradient-to-br ${gradient} cursor-pointer transition-all duration-300 hover:shadow-lg ${
        active ? "ring-2 ring-purple-400 ring-offset-2" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium opacity-90">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
        </div>
        <Icon className="w-8 h-8 opacity-80" />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: EmployeeStatus }) {
  const isActive = status === "active";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
        isActive ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
      }`}
    >
      {isActive ? <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> : <FiClock className="w-3 h-3" />}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}