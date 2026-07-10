import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  FiUsers,
  FiUserCheck,
  FiUserX,
  FiPlus,
  FiArrowRight,
  FiClock,
  FiBriefcase,
  FiMail,
  FiPhone,
  FiTrendingUp,
  FiTrendingDown,
  FiStar,
} from "react-icons/fi";
import { useAuth } from "../../../common/auth/useAuth";

/* ================= TYPES ================= */

interface Employee {
  id: number;
  name: string;
  email: string;
  phone: string;
  department: string;
  role: string;
  status: "active" | "pending";
  created_at: string;
  totalRewards: number; // added for rewards tracking
}

interface StatCard {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  trend?: string;
  trendUp?: boolean;
}

interface DepartmentData {
  name: string;
  count: number;
  color: string;
}

/* ================= COMPONENT ================= */

export default function HrDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);

  /* ================= MOCK DATA WITH REWARDS ================= */
  useEffect(() => {
    const timer = setTimeout(() => {
      const mockEmployees: Employee[] = [
        {
          id: 1,
          name: "Rahul Sharma",
          email: "rahul.sharma@company.com",
          phone: "+91 9876543210",
          department: "Human Resources",
          role: "HR Manager",
          status: "active",
          created_at: "2025-01-15",
          totalRewards: 125000,
        },
        {
          id: 2,
          name: "Priya Patel",
          email: "priya.patel@company.com",
          phone: "+91 9123456780",
          department: "Engineering",
          role: "Senior Developer",
          status: "active",
          created_at: "2025-01-20",
          totalRewards: 98000,
        },
        {
          id: 3,
          name: "Amit Kumar",
          email: "amit.kumar@company.com",
          phone: "+91 9988776655",
          department: "Marketing",
          role: "Marketing Lead",
          status: "pending",
          created_at: "2025-02-01",
          totalRewards: 45000,
        },
        {
          id: 4,
          name: "Sneha Gupta",
          email: "sneha.gupta@company.com",
          phone: "+91 9876543211",
          department: "Finance",
          role: "Accountant",
          status: "active",
          created_at: "2025-02-05",
          totalRewards: 62000,
        },
        {
          id: 5,
          name: "Vikram Singh",
          email: "vikram.singh@company.com",
          phone: "+91 9876543212",
          department: "Operations",
          role: "Operations Manager",
          status: "pending",
          created_at: "2025-02-10",
          totalRewards: 73000,
        },
        {
          id: 6,
          name: "Anjali Verma",
          email: "anjali.verma@company.com",
          phone: "+91 9876543213",
          department: "Engineering",
          role: "Software Engineer",
          status: "active",
          created_at: "2025-02-15",
          totalRewards: 87000,
        },
        {
          id: 7,
          name: "Raj Malhotra",
          email: "raj.malhotra@company.com",
          phone: "+91 9876543214",
          department: "Sales",
          role: "Sales Manager",
          status: "active",
          created_at: "2025-02-20",
          totalRewards: 112000,
        },
        {
          id: 8,
          name: "Kavita Singh",
          email: "kavita.singh@company.com",
          phone: "+91 9876543215",
          department: "IT",
          role: "System Admin",
          status: "pending",
          created_at: "2025-02-25",
          totalRewards: 39000,
        },
        {
          id: 9,
          name: "Deepak Joshi",
          email: "deepak.joshi@company.com",
          phone: "+91 9876543216",
          department: "Engineering",
          role: "Tech Lead",
          status: "active",
          created_at: "2025-03-01",
          totalRewards: 145000,
        },
        {
          id: 10,
          name: "Neha Kapoor",
          email: "neha.kapoor@company.com",
          phone: "+91 9876543217",
          department: "Marketing",
          role: "SEO Specialist",
          status: "active",
          created_at: "2025-03-05",
          totalRewards: 54000,
        },
      ];
      setEmployees(mockEmployees);
      setLoading(false);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  // Top 10 employees by totalRewards
  const topTenEmployees = [...employees]
    .sort((a, b) => b.totalRewards - a.totalRewards)
    .slice(0, 10);

  // Total rewards distributed across all employees
  const totalRewardsDistributed = employees.reduce(
    (acc, curr) => acc + curr.totalRewards,
    0
  );

  /* ================= STATS ================= */
  const stats: StatCard[] = [
    {
      title: "Total Employees",
      value: employees.length,
      icon: FiUsers,
      gradient: "from-[#852BAF] to-[#FC3F78]",
      trend: "+12%",
      trendUp: true,
    },
    {
      title: "Active Employees",
      value: employees.filter((e) => e.status === "active").length,
      icon: FiUserCheck,
      gradient: "from-emerald-500 to-teal-600",
      trend: "+5%",
      trendUp: true,
    },
    {
      title: "Pending Onboarding",
      value: employees.filter((e) => e.status === "pending").length,
      icon: FiUserX,
      gradient: "from-amber-500 to-orange-600",
      trend: "-3%",
      trendUp: false,
    },
    {
      title: "Departments",
      value: [...new Set(employees.map((e) => e.department))].length,
      icon: FiBriefcase,
      gradient: "from-rose-500 to-pink-600",
      trend: "+1",
      trendUp: true,
    },
  ];

  /* ================= DEPARTMENT DATA ================= */
  const departmentCounts = employees.reduce((acc, emp) => {
    acc[emp.department] = (acc[emp.department] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const departmentData: DepartmentData[] = Object.entries(departmentCounts).map(
    ([name, count], idx) => {
      const colors = ["#852BAF", "#FC3F78", "#8B5CF6", "#10B981", "#F59E0B", "#3B82F6", "#EC4899"];
      return { name, count, color: colors[idx % colors.length] };
    }
  );

  const maxCount = Math.max(...departmentData.map((d) => d.count), 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-purple-200 rounded-full border-t-purple-600 animate-spin"></div>
          <p className="font-medium text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 bg-gradient-to-br from-slate-50 via-white to-slate-100 md:p-6 lg:p-8">
      {/* ================= HEADER ================= */}
      <div className="flex flex-col gap-4 mb-8 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 md:text-4xl">
            HR{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#852BAF] to-[#FC3F78]">
              Dashboard
            </span>
          </h1>
          <p className="mt-1 font-medium text-gray-500">
            Welcome back,{" "}
            <span className="text-gray-800">
              {user?.email?.split("@")[0] || "HR Admin"}
            </span>
            . Here's your team overview.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/hr/onboarding"
            className="flex items-center gap-2 px-5 py-2.5 text-white font-semibold rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-lg shadow-purple-500/30 transition-all duration-300 hover:scale-105"
          >
            <FiPlus className="w-5 h-5" />
            Add Employee
          </Link>
        </div>
      </div>

      {/* ================= STATS GRID ================= */}
      <div className="grid grid-cols-1 gap-5 mb-8 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="relative overflow-hidden transition-all duration-300 bg-white border border-gray-100 shadow-md rounded-2xl hover:shadow-xl group"
          >
            <div
              className="absolute top-0 right-0 w-24 h-24 -mt-8 -mr-8 transition-transform duration-500 rounded-full bg-gradient-to-br opacity-10 group-hover:scale-150"
              style={{
                background: `linear-gradient(135deg, ${stat.gradient.includes("#852BAF") ? "#852BAF" : "#FC3F78"}, transparent)`,
              }}
            ></div>
            <div className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div
                  className={`p-3 rounded-xl bg-gradient-to-br ${stat.gradient} shadow-lg`}
                >
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
                {stat.trend && (
                  <span
                    className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${
                      stat.trendUp
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {stat.trendUp ? (
                      <FiTrendingUp className="w-3 h-3" />
                    ) : (
                      <FiTrendingDown className="w-3 h-3" />
                    )}
                    {stat.trend}
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-gray-500">{stat.title}</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ================= CHARTS SECTION ================= */}
      <div className="grid grid-cols-1 gap-6 mb-8 lg:grid-cols-2">
        {/* Department Distribution Chart */}
        <div className="p-6 bg-white border border-gray-100 shadow-md rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-xl">
              <FiBriefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Department Distribution
              </h2>
              <p className="text-sm text-gray-500">Employees by department</p>
            </div>
          </div>

          <div className="space-y-4">
            {departmentData.map((dept, index) => (
              <div key={index} className="group">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">
                    {dept.name}
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {dept.count}
                  </span>
                </div>
                <div className="w-full h-3 overflow-hidden bg-gray-100 rounded-full">
                  <div
                    className="h-full transition-all duration-1000 ease-out rounded-full group-hover:opacity-80"
                    style={{
                      width: `${(dept.count / maxCount) * 100}%`,
                      background: `linear-gradient(90deg, ${dept.color}, ${dept.color}99)`,
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Status Overview Chart */}
        <div className="p-6 bg-white border border-gray-100 shadow-md rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-xl">
              <FiUsers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Employee Status
              </h2>
              <p className="text-sm text-gray-500">Active vs Pending overview</p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-8">
            {/* Donut Chart */}
            <div className="relative w-40 h-40">
              <svg
                className="w-full h-full transform -rotate-90"
                viewBox="0 0 100 100"
              >
                <circle cx="50" cy="50" r="40" fill="none" stroke="#E5E7EB" strokeWidth="12" />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="url(#gradientActive)"
                  strokeWidth="12"
                  strokeDasharray={`${
                    (employees.filter((e) => e.status === "active").length /
                      employees.length) *
                    251.2
                  } 251.2`}
                  strokeLinecap="round"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="12"
                  strokeDasharray={`${
                    (employees.filter((e) => e.status === "pending").length /
                      employees.length) *
                    251.2
                  } 251.2`}
                  strokeDashoffset={`-${
                    (employees.filter((e) => e.status === "active").length /
                      employees.length) *
                    251.2
                  }`}
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="gradientActive" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#852BAF" />
                    <stop offset="100%" stopColor="#FC3F78" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-3xl font-bold text-gray-900">
                    {employees.length}
                  </p>
                  <p className="text-xs text-gray-500">Total</p>
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-gradient-to-r from-[#852BAF] to-[#FC3F78]"></div>
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    {employees.filter((e) => e.status === "active").length}
                  </p>
                  <p className="text-xs text-gray-500">Active</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-amber-500"></div>
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    {employees.filter((e) => e.status === "pending").length}
                  </p>
                  <p className="text-xs text-gray-500">Pending</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= TOP 10 & RECENT EMPLOYEES ROW ================= */}
      <div className="grid grid-cols-1 gap-8 mb-8 lg:grid-cols-3">
        {/* Top 10 Rewarded Users (Leaderboard) */}
        <div className="flex flex-col bg-white border border-gray-100 shadow-md lg:col-span-1 rounded-2xl">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
                <FiStar className="w-5 h-5" />
              </div>
              <h2 className="text-sm font-bold tracking-widest text-gray-900 uppercase">
                Top 10 Earners
              </h2>
            </div>
            <div className="text-sm font-bold text-gray-700">
              ₹{totalRewardsDistributed.toLocaleString()} total
            </div>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[500px] p-2 space-y-1">
            {topTenEmployees.map((emp, index) => (
              <div
                key={emp.id}
                className="flex items-center justify-between p-3 transition-colors rounded-xl hover:bg-gray-50 group"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-6 text-xs font-black ${
                      index < 3 ? "text-amber-500" : "text-gray-300"
                    }`}
                  >
                    #{index + 1}
                  </span>
                  <div className="flex items-center justify-center w-10 h-10 font-bold text-gray-600 border border-white rounded-full shadow-sm bg-gradient-to-tr from-gray-100 to-gray-200">
                    {emp.name.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold leading-none text-gray-800">
                      {emp.name}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">{emp.role}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-gray-900">
                    ₹{emp.totalRewards.toLocaleString()}
                  </p>
                  <div className="w-16 h-1 mt-1 overflow-hidden bg-gray-100 rounded-full">
                    <div
                      className="h-full bg-emerald-500"
                      style={{
                        width: `${(emp.totalRewards / topTenEmployees[0].totalRewards) * 100}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-gray-50 bg-gray-50/50 rounded-b-2xl">
            <button className="w-full py-2 text-xs font-bold text-purple-600 transition-colors hover:text-purple-800">
              Download Rewards Report
            </button>
          </div>
        </div>

        {/* Recent Employees Table */}
        <div className="overflow-hidden bg-white border border-gray-100 shadow-md lg:col-span-2 rounded-2xl">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-xl">
                <FiUsers className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Recent Employees
                </h2>
                <p className="text-sm text-gray-500">Latest team members</p>
              </div>
            </div>
            <Link
              to="/hr/employees"
              className="flex items-center gap-2 text-sm font-semibold text-purple-600 transition-colors hover:text-pink-600"
            >
              View All
              <FiArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr className="text-xs font-semibold tracking-wider text-left text-gray-500 uppercase">
                  <th className="px-5 py-4">Employee</th>
                  <th className="px-5 py-4">Contact</th>
                  <th className="px-5 py-4">Department</th>
                  <th className="px-5 py-4">Role</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.slice(0, 5).map((employee) => (
                  <tr
                    key={employee.id}
                    className="transition-colors hover:bg-gray-50"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 font-bold text-white rounded-full bg-gradient-to-r from-purple-500 to-pink-500">
                          {employee.name.charAt(0)}
                        </div>
                        <span className="font-semibold text-gray-900">
                          {employee.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <FiMail className="w-3 h-3" />
                          {employee.email}
                        </div>
                        <div className="flex items-center gap-2 text-gray-500 mt-0.5">
                          <FiPhone className="w-3 h-3" />
                          {employee.phone}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm font-medium text-gray-700">
                        {employee.department}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-gray-600">
                        {employee.role}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                          employee.status === "active"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {employee.status === "active" ? (
                          <>
                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                            Active
                          </>
                        ) : (
                          <>
                            <FiClock className="w-3 h-3" />
                            Pending
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-gray-500">
                        {employee.created_at}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ================= QUICK ACTIONS ================= */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <Link
          to="/hr/onboarding"
          className="flex items-center gap-4 p-5 transition-all duration-300 bg-white border border-gray-100 shadow-md rounded-2xl hover:shadow-lg hover:border-purple-200 group"
        >
          <div className="p-3 transition-transform rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 group-hover:scale-110">
            <FiPlus className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Add New Employee</h3>
            <p className="text-sm text-gray-500">Onboard a new team member</p>
          </div>
        </Link>

        <Link
          to="/hr/employees"
          className="flex items-center gap-4 p-5 transition-all duration-300 bg-white border border-gray-100 shadow-md rounded-2xl hover:shadow-lg hover:border-emerald-200 group"
        >
          <div className="p-3 transition-transform rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 group-hover:scale-110">
            <FiUsers className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Manage Employees</h3>
            <p className="text-sm text-gray-500">View & edit employee records</p>
          </div>
        </Link>

        <div className="flex items-center gap-4 p-5 text-white shadow-lg bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl">
          <div className="p-3 rounded-xl bg-white/20">
            <FiUserX className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold">Pending Approvals</h3>
            <p className="text-sm text-purple-100">
              {employees.filter((e) => e.status === "pending").length} employees
              waiting
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}