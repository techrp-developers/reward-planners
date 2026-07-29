import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  FiGrid,
  FiUsers,
  FiTag,
  FiShoppingBag,
  FiArrowRight,
  FiClock,
  FiCheckCircle,
  FiTrendingUp,
  FiTrendingDown,
  FiPackage,
  FiBarChart2,
  FiAlertCircle,
} from "react-icons/fi";
import { useAuth } from "../../../common/auth/useAuth";
import { routes } from "../../../routes";

/* ================= TYPES ================= */

interface Stall {
  id: number;
  code: string;
  vendor: string;
  category: string;
  status: "occupied" | "vacant";
}

interface Transaction {
  id: number;
  txnId: string;
  vendor: string;
  item: string;
  stall: string;
  amount: number;
  date: string;
  status: "completed" | "pending";
}

interface StallRequest {
  id: number;
  vendor: string;
  category: string;
  requestedOn: string;
  priority: "high" | "medium" | "low";
}

interface StatCard {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  trend?: string;
  trendUp?: boolean;
}

interface CategoryData {
  name: string;
  count: number;
  color: string;
}

/* ================= COMPONENT ================= */

export default function FleaMarketDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stalls, setStalls] = useState<Stall[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [requests, setRequests] = useState<StallRequest[]>([]);

  /* ================= MOCK DATA ================= */
  useEffect(() => {
    const timer = setTimeout(() => {
      const mockStalls: Stall[] = [
        { id: 1, code: "ST-101", vendor: "Rustic Finds", category: "Antiques", status: "occupied" },
        { id: 2, code: "ST-102", vendor: "Threadwork Co.", category: "Clothing", status: "occupied" },
        { id: 3, code: "ST-103", vendor: "—", category: "—", status: "vacant" },
        { id: 4, code: "ST-104", vendor: "Clay & Craft", category: "Handicrafts", status: "occupied" },
        { id: 5, code: "ST-105", vendor: "Vintage Vault", category: "Furniture", status: "occupied" },
        { id: 6, code: "ST-106", vendor: "—", category: "—", status: "vacant" },
        { id: 7, code: "ST-107", vendor: "Silver Lane", category: "Jewelry", status: "occupied" },
        { id: 8, code: "ST-108", vendor: "Boho Beads", category: "Jewelry", status: "occupied" },
        { id: 9, code: "ST-109", vendor: "—", category: "—", status: "vacant" },
        { id: 10, code: "ST-110", vendor: "Old Print Shop", category: "Antiques", status: "occupied" },
      ];

      const mockTransactions: Transaction[] = [
        { id: 1, txnId: "TXN-5231", vendor: "Rustic Finds", item: "Brass Lantern", stall: "ST-101", amount: 850, date: "2026-07-21", status: "completed" },
        { id: 2, txnId: "TXN-5232", vendor: "Threadwork Co.", item: "Embroidered Shawl", stall: "ST-102", amount: 1200, date: "2026-07-21", status: "completed" },
        { id: 3, txnId: "TXN-5233", vendor: "Silver Lane", item: "Oxidised Earrings", stall: "ST-107", amount: 450, date: "2026-07-20", status: "pending" },
        { id: 4, txnId: "TXN-5234", vendor: "Vintage Vault", item: "Wooden Trunk", stall: "ST-105", amount: 3200, date: "2026-07-20", status: "completed" },
        { id: 5, txnId: "TXN-5235", vendor: "Clay & Craft", item: "Terracotta Set", stall: "ST-104", amount: 680, date: "2026-07-19", status: "pending" },
        { id: 6, txnId: "TXN-5236", vendor: "Boho Beads", item: "Beaded Necklace", stall: "ST-108", amount: 390, date: "2026-07-19", status: "completed" },
      ];

      const mockRequests: StallRequest[] = [
        { id: 1, vendor: "Handloom Hub", category: "Clothing", requestedOn: "2026-07-19", priority: "high" },
        { id: 2, vendor: "Retro Records", category: "Antiques", requestedOn: "2026-07-18", priority: "medium" },
        { id: 3, vendor: "Potter's Corner", category: "Handicrafts", requestedOn: "2026-07-17", priority: "low" },
        { id: 4, vendor: "Denim Diaries", category: "Clothing", requestedOn: "2026-07-16", priority: "medium" },
      ];

      setStalls(mockStalls);
      setTransactions(mockTransactions);
      setRequests(mockRequests);
      setLoading(false);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  const occupiedStalls = stalls.filter((s) => s.status === "occupied");
  const vacantStalls = stalls.filter((s) => s.status === "vacant");
  const activeVendors = new Set(occupiedStalls.map((s) => s.vendor)).size;
  const todaysSales = transactions
    .filter((t) => t.date === "2026-07-21")
    .reduce((acc, t) => acc + t.amount, 0);

  /* ================= STATS ================= */
  const stats: StatCard[] = [
    {
      title: "Total Stalls",
      value: stalls.length,
      icon: FiGrid,
      gradient: "from-[#852BAF] to-[#FC3F78]",
      trend: "+2",
      trendUp: true,
    },
    {
      title: "Active Vendors",
      value: activeVendors,
      icon: FiUsers,
      gradient: "from-emerald-500 to-teal-600",
      trend: "+5%",
      trendUp: true,
    },
    {
      title: "Vacant Stalls",
      value: vacantStalls.length,
      icon: FiAlertCircle,
      gradient: "from-amber-500 to-orange-600",
      trend: "-1",
      trendUp: false,
    },
    {
      title: "Today's Sales",
      value: `₹${todaysSales.toLocaleString()}`,
      icon: FiShoppingBag,
      gradient: "from-rose-500 to-pink-600",
      trend: "+12%",
      trendUp: true,
    },
  ];

  /* ================= CATEGORY DISTRIBUTION ================= */
  const categoryCounts = occupiedStalls.reduce((acc, stall) => {
    acc[stall.category] = (acc[stall.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const categoryData: CategoryData[] = Object.entries(categoryCounts).map(
    ([name, count], idx) => {
      const colors = ["#852BAF", "#FC3F78", "#8B5CF6", "#10B981", "#F59E0B"];
      return { name, count, color: colors[idx % colors.length] };
    }
  );

  const maxCategoryCount = Math.max(...categoryData.map((d) => d.count), 1);

  const completedCount = transactions.filter((t) => t.status === "completed").length;
  const pendingCount = transactions.filter((t) => t.status === "pending").length;

  const priorityStyles: Record<StallRequest["priority"], string> = {
    high: "bg-red-100 text-red-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-gray-100 text-gray-600",
  };

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
            Flea Market{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#852BAF] to-[#FC3F78]">
              Dashboard
            </span>
          </h1>
          <p className="mt-1 font-medium text-gray-500">
            Welcome back,{" "}
            <span className="text-gray-800">
              {user?.email?.split("@")[0] || "Flea Market Manager"}
            </span>
            . Here's your market overview.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to={routes.fleaMarket.allocations}
            className="flex items-center gap-2 px-5 py-2.5 text-white font-semibold rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-lg shadow-purple-500/30 transition-all duration-300 hover:scale-105"
          >
            <FiPackage className="w-5 h-5" />
            Allocate Stock
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
        {/* Category Distribution Chart */}
        <div className="p-6 bg-white border border-gray-100 shadow-md rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-xl">
              <FiTag className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Stalls by Category
              </h2>
              <p className="text-sm text-gray-500">Occupied stall distribution</p>
            </div>
          </div>

          <div className="space-y-4">
            {categoryData.map((cat, index) => (
              <div key={index} className="group">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">
                    {cat.name}
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {cat.count}
                  </span>
                </div>
                <div className="w-full h-3 overflow-hidden bg-gray-100 rounded-full">
                  <div
                    className="h-full transition-all duration-1000 ease-out rounded-full group-hover:opacity-80"
                    style={{
                      width: `${(cat.count / maxCategoryCount) * 100}%`,
                      background: `linear-gradient(90deg, ${cat.color}, ${cat.color}99)`,
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transaction Status Chart */}
        <div className="p-6 bg-white border border-gray-100 shadow-md rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-xl">
              <FiShoppingBag className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Transaction Status
              </h2>
              <p className="text-sm text-gray-500">Completed vs Pending sales</p>
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
                  stroke="url(#gradientCompleted)"
                  strokeWidth="12"
                  strokeDasharray={`${
                    (completedCount / transactions.length) * 251.2
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
                    (pendingCount / transactions.length) * 251.2
                  } 251.2`}
                  strokeDashoffset={`-${
                    (completedCount / transactions.length) * 251.2
                  }`}
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="gradientCompleted" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#852BAF" />
                    <stop offset="100%" stopColor="#FC3F78" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-3xl font-bold text-gray-900">
                    {transactions.length}
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
                  <p className="text-sm font-bold text-gray-900">{completedCount}</p>
                  <p className="text-xs text-gray-500">Completed</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full bg-amber-500"></div>
                <div>
                  <p className="text-sm font-bold text-gray-900">{pendingCount}</p>
                  <p className="text-xs text-gray-500">Pending</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================= STALL REQUESTS & RECENT TRANSACTIONS ROW ================= */}
      <div className="grid grid-cols-1 gap-8 mb-8 lg:grid-cols-3">
        {/* Pending Stall Requests (Leaderboard) */}
        <div className="flex flex-col bg-white border border-gray-100 shadow-md lg:col-span-1 rounded-2xl">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
                <FiAlertCircle className="w-5 h-5" />
              </div>
              <h2 className="text-sm font-bold tracking-widest text-gray-900 uppercase">
                Stall Requests
              </h2>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[500px] p-2 space-y-1">
            {requests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between p-3 transition-colors rounded-xl hover:bg-gray-50 group"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 font-bold text-gray-600 border border-white rounded-full shadow-sm bg-gradient-to-tr from-gray-100 to-gray-200">
                    {req.vendor.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold leading-none text-gray-800">
                      {req.vendor}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">{req.category} · {req.requestedOn}</p>
                  </div>
                </div>
                <span
                  className={`text-[11px] font-bold px-2 py-1 rounded-full capitalize ${priorityStyles[req.priority]}`}
                >
                  {req.priority}
                </span>
              </div>
            ))}
            {requests.length === 0 && (
              <p className="p-4 text-sm text-center text-gray-400">No pending requests</p>
            )}
          </div>
          <div className="p-4 border-t border-gray-50 bg-gray-50/50 rounded-b-2xl">
            <Link
              to={routes.fleaMarket.allocations}
              className="block w-full py-2 text-xs font-bold text-center text-purple-600 transition-colors hover:text-purple-800"
            >
              Go to Stock Allocation
            </Link>
          </div>
        </div>

        {/* Recent Transactions Table */}
        <div className="overflow-hidden bg-white border border-gray-100 shadow-md lg:col-span-2 rounded-2xl">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-xl">
                <FiShoppingBag className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Recent Transactions
                </h2>
                <p className="text-sm text-gray-500">Latest vendor sales</p>
              </div>
            </div>
            <Link
              to={routes.fleaMarket.reports.purchaseHistory}
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
                  <th className="px-5 py-4">Txn ID</th>
                  <th className="px-5 py-4">Vendor</th>
                  <th className="px-5 py-4">Item</th>
                  <th className="px-5 py-4">Stall</th>
                  <th className="px-5 py-4">Amount</th>
                  <th className="px-5 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.map((t) => (
                  <tr key={t.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <span className="font-semibold text-gray-900">{t.txnId}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-gray-700">{t.vendor}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-gray-700">{t.item}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-gray-600">{t.stall}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm font-medium text-gray-700">₹{t.amount.toLocaleString()}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                          t.status === "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {t.status === "completed" ? (
                          <>
                            <FiCheckCircle className="w-3 h-3" />
                            Completed
                          </>
                        ) : (
                          <>
                            <FiClock className="w-3 h-3" />
                            Pending
                          </>
                        )}
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
          to={routes.fleaMarket.manageEvent}
          className="flex items-center gap-4 p-5 transition-all duration-300 bg-white border border-gray-100 shadow-md rounded-2xl hover:shadow-lg hover:border-purple-200 group"
        >
          <div className="p-3 transition-transform rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 group-hover:scale-110">
            <FiGrid className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Manage Event</h3>
            <p className="text-sm text-gray-500">Schedule or update a flea market event</p>
          </div>
        </Link>

        <Link
          to={routes.fleaMarket.allocations}
          className="flex items-center gap-4 p-5 transition-all duration-300 bg-white border border-gray-100 shadow-md rounded-2xl hover:shadow-lg hover:border-emerald-200 group"
        >
          <div className="p-3 transition-transform rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 group-hover:scale-110">
            <FiPackage className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Allocate Stock</h3>
            <p className="text-sm text-gray-500">Assign vendor stock to an event</p>
          </div>
        </Link>

        <Link
          to={routes.fleaMarket.reports.vendorSales}
          className="flex items-center gap-4 p-5 text-white transition-all duration-300 shadow-lg bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl hover:shadow-xl"
        >
          <div className="p-3 rounded-xl bg-white/20">
            <FiBarChart2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold">Vendor Sales Report</h3>
            <p className="text-sm text-purple-100">See vendor-wise selling history</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
