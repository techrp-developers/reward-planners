import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  FiPackage,
  FiArrowDownCircle,
  FiArrowUpCircle,
  FiAlertTriangle,
  FiPlus,
  FiArrowRight,
  FiClock,
  FiTruck,
  FiSliders,
  FiTrendingUp,
  FiTrendingDown,
  FiCheckCircle,
} from "react-icons/fi";
import { useAuth } from "../../../common/auth/useAuth";

/* ================= TYPES ================= */

interface StockItem {
  id: number;
  sku: string;
  name: string;
  warehouse: string;
  quantity: number;
  reorderLevel: number;
}

interface Movement {
  id: number;
  grn: string;
  product: string;
  type: "in" | "out";
  quantity: number;
  warehouse: string;
  date: string;
  status: "completed" | "pending";
}

interface StatCard {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  trend?: string;
  trendUp?: boolean;
}

interface WarehouseData {
  name: string;
  count: number;
  color: string;
}

/* ================= COMPONENT ================= */

export default function WarehouseDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);

  /* ================= MOCK DATA ================= */
  useEffect(() => {
    const timer = setTimeout(() => {
      const mockStock: StockItem[] = [
        { id: 1, sku: "SKU-1001", name: "Wireless Mouse", warehouse: "Mumbai WH-1", quantity: 12, reorderLevel: 50 },
        { id: 2, sku: "SKU-1002", name: "Bluetooth Speaker", warehouse: "Delhi WH-2", quantity: 8, reorderLevel: 40 },
        { id: 3, sku: "SKU-1003", name: "USB-C Cable 1m", warehouse: "Mumbai WH-1", quantity: 320, reorderLevel: 100 },
        { id: 4, sku: "SKU-1004", name: "Laptop Stand", warehouse: "Bangalore WH-3", quantity: 5, reorderLevel: 30 },
        { id: 5, sku: "SKU-1005", name: "Mechanical Keyboard", warehouse: "Delhi WH-2", quantity: 145, reorderLevel: 60 },
        { id: 6, sku: "SKU-1006", name: "27\" Monitor", warehouse: "Bangalore WH-3", quantity: 18, reorderLevel: 25 },
        { id: 7, sku: "SKU-1007", name: "Webcam HD", warehouse: "Mumbai WH-1", quantity: 210, reorderLevel: 80 },
        { id: 8, sku: "SKU-1008", name: "Power Bank 10000mAh", warehouse: "Delhi WH-2", quantity: 3, reorderLevel: 45 },
      ];

      const mockMovements: Movement[] = [
        { id: 1, grn: "GRN-8231", product: "Wireless Mouse", type: "in", quantity: 100, warehouse: "Mumbai WH-1", date: "2026-07-12", status: "completed" },
        { id: 2, grn: "GRN-8232", product: "27\" Monitor", type: "out", quantity: 15, warehouse: "Bangalore WH-3", date: "2026-07-12", status: "completed" },
        { id: 3, grn: "GRN-8233", product: "Mechanical Keyboard", type: "in", quantity: 60, warehouse: "Delhi WH-2", date: "2026-07-11", status: "pending" },
        { id: 4, grn: "GRN-8234", product: "USB-C Cable 1m", type: "out", quantity: 250, warehouse: "Mumbai WH-1", date: "2026-07-11", status: "completed" },
        { id: 5, grn: "GRN-8235", product: "Power Bank 10000mAh", type: "in", quantity: 40, warehouse: "Delhi WH-2", date: "2026-07-10", status: "pending" },
        { id: 6, grn: "GRN-8236", product: "Webcam HD", type: "out", quantity: 90, warehouse: "Mumbai WH-1", date: "2026-07-10", status: "completed" },
      ];

      setStockItems(mockStock);
      setMovements(mockMovements);
      setLoading(false);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  // Low stock items (quantity below reorder level), sorted by most critical
  const lowStockItems = [...stockItems]
    .filter((item) => item.quantity < item.reorderLevel)
    .sort((a, b) => a.quantity / a.reorderLevel - b.quantity / b.reorderLevel)
    .slice(0, 10);

  const totalUnitsInStock = stockItems.reduce((acc, curr) => acc + curr.quantity, 0);
  const pendingMovements = movements.filter((m) => m.status === "pending").length;

  /* ================= STATS ================= */
  const stats: StatCard[] = [
    {
      title: "Total SKUs",
      value: stockItems.length,
      icon: FiPackage,
      gradient: "from-[#852BAF] to-[#FC3F78]",
      trend: "+4%",
      trendUp: true,
    },
    {
      title: "Units In Stock",
      value: totalUnitsInStock.toLocaleString(),
      icon: FiArrowDownCircle,
      gradient: "from-emerald-500 to-teal-600",
      trend: "+8%",
      trendUp: true,
    },
    {
      title: "Low Stock Alerts",
      value: lowStockItems.length,
      icon: FiAlertTriangle,
      gradient: "from-amber-500 to-orange-600",
      trend: "-2%",
      trendUp: false,
    },
    {
      title: "Pending Movements",
      value: pendingMovements,
      icon: FiClock,
      gradient: "from-rose-500 to-pink-600",
      trend: "+1",
      trendUp: false,
    },
  ];

  /* ================= WAREHOUSE DISTRIBUTION ================= */
  const warehouseCounts = stockItems.reduce((acc, item) => {
    acc[item.warehouse] = (acc[item.warehouse] || 0) + item.quantity;
    return acc;
  }, {} as Record<string, number>);

  const warehouseData: WarehouseData[] = Object.entries(warehouseCounts).map(
    ([name, count], idx) => {
      const colors = ["#852BAF", "#FC3F78", "#8B5CF6", "#10B981", "#F59E0B"];
      return { name, count, color: colors[idx % colors.length] };
    }
  );

  const maxCount = Math.max(...warehouseData.map((d) => d.count), 1);

  const completedCount = movements.filter((m) => m.status === "completed").length;
  const pendingCount = movements.filter((m) => m.status === "pending").length;

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
            Warehouse{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#852BAF] to-[#FC3F78]">
              Dashboard
            </span>
          </h1>
          <p className="mt-1 font-medium text-gray-500">
            Welcome back,{" "}
            <span className="text-gray-800">
              {user?.email?.split("@")[0] || "Warehouse Manager"}
            </span>
            . Here's your stock overview.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/warehouse/stock/stockin"
            className="flex items-center gap-2 px-5 py-2.5 text-white font-semibold rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] hover:from-[#9B3DCF] hover:to-[#FD4F88] shadow-lg shadow-purple-500/30 transition-all duration-300 hover:scale-105"
          >
            <FiPlus className="w-5 h-5" />
            New Stock In
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
        {/* Warehouse Distribution Chart */}
        <div className="p-6 bg-white border border-gray-100 shadow-md rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-xl">
              <FiPackage className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Units by Warehouse
              </h2>
              <p className="text-sm text-gray-500">Stock distribution across locations</p>
            </div>
          </div>

          <div className="space-y-4">
            {warehouseData.map((wh, index) => (
              <div key={index} className="group">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">
                    {wh.name}
                  </span>
                  <span className="text-sm font-bold text-gray-900">
                    {wh.count.toLocaleString()}
                  </span>
                </div>
                <div className="w-full h-3 overflow-hidden bg-gray-100 rounded-full">
                  <div
                    className="h-full transition-all duration-1000 ease-out rounded-full group-hover:opacity-80"
                    style={{
                      width: `${(wh.count / maxCount) * 100}%`,
                      background: `linear-gradient(90deg, ${wh.color}, ${wh.color}99)`,
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Movement Status Chart */}
        <div className="p-6 bg-white border border-gray-100 shadow-md rounded-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-xl">
              <FiTruck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Movement Status
              </h2>
              <p className="text-sm text-gray-500">Completed vs Pending stock movements</p>
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
                    (completedCount / movements.length) * 251.2
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
                    (pendingCount / movements.length) * 251.2
                  } 251.2`}
                  strokeDashoffset={`-${
                    (completedCount / movements.length) * 251.2
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
                    {movements.length}
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

      {/* ================= LOW STOCK & RECENT MOVEMENTS ROW ================= */}
      <div className="grid grid-cols-1 gap-8 mb-8 lg:grid-cols-3">
        {/* Low Stock Alerts (Leaderboard) */}
        <div className="flex flex-col bg-white border border-gray-100 shadow-md lg:col-span-1 rounded-2xl">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
                <FiAlertTriangle className="w-5 h-5" />
              </div>
              <h2 className="text-sm font-bold tracking-widest text-gray-900 uppercase">
                Low Stock Alerts
              </h2>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[500px] p-2 space-y-1">
            {lowStockItems.map((item) => {
              const ratio = item.quantity / item.reorderLevel;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 transition-colors rounded-xl hover:bg-gray-50 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 font-bold text-gray-600 border border-white rounded-full shadow-sm bg-gradient-to-tr from-gray-100 to-gray-200">
                      {item.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-bold leading-none text-gray-800">
                        {item.name}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">{item.sku} · {item.warehouse}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-amber-600">
                      {item.quantity} / {item.reorderLevel}
                    </p>
                    <div className="w-16 h-1 mt-1 overflow-hidden bg-gray-100 rounded-full">
                      <div
                        className="h-full bg-amber-500"
                        style={{ width: `${Math.min(ratio, 1) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              );
            })}
            {lowStockItems.length === 0 && (
              <p className="p-4 text-sm text-center text-gray-400">No low stock items</p>
            )}
          </div>
          <div className="p-4 border-t border-gray-50 bg-gray-50/50 rounded-b-2xl">
            <Link
              to="/warehouse/stock/stockadjustment"
              className="block w-full py-2 text-xs font-bold text-center text-purple-600 transition-colors hover:text-purple-800"
            >
              Go to Stock Adjustment
            </Link>
          </div>
        </div>

        {/* Recent Stock Movements Table */}
        <div className="overflow-hidden bg-white border border-gray-100 shadow-md lg:col-span-2 rounded-2xl">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-xl">
                <FiTruck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Recent Stock Movements
                </h2>
                <p className="text-sm text-gray-500">Latest inbound & outbound entries</p>
              </div>
            </div>
            <Link
              to="/warehouse/inventory"
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
                  <th className="px-5 py-4">GRN</th>
                  <th className="px-5 py-4">Product</th>
                  <th className="px-5 py-4">Type</th>
                  <th className="px-5 py-4">Quantity</th>
                  <th className="px-5 py-4">Warehouse</th>
                  <th className="px-5 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movements.map((m) => (
                  <tr key={m.id} className="transition-colors hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <span className="font-semibold text-gray-900">{m.grn}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-gray-700">{m.product}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                          m.type === "in"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-rose-100 text-rose-700"
                        }`}
                      >
                        {m.type === "in" ? (
                          <FiArrowDownCircle className="w-3 h-3" />
                        ) : (
                          <FiArrowUpCircle className="w-3 h-3" />
                        )}
                        {m.type === "in" ? "Stock In" : "Stock Out"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm font-medium text-gray-700">{m.quantity}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm text-gray-600">{m.warehouse}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                          m.status === "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {m.status === "completed" ? (
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
          to="/warehouse/stock/stockin"
          className="flex items-center gap-4 p-5 transition-all duration-300 bg-white border border-gray-100 shadow-md rounded-2xl hover:shadow-lg hover:border-purple-200 group"
        >
          <div className="p-3 transition-transform rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 group-hover:scale-110">
            <FiArrowDownCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Stock In</h3>
            <p className="text-sm text-gray-500">Record a new inbound shipment</p>
          </div>
        </Link>

        <Link
          to="/warehouse/stock/stockadjustment"
          className="flex items-center gap-4 p-5 transition-all duration-300 bg-white border border-gray-100 shadow-md rounded-2xl hover:shadow-lg hover:border-emerald-200 group"
        >
          <div className="p-3 transition-transform rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 group-hover:scale-110">
            <FiSliders className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Stock Adjustment</h3>
            <p className="text-sm text-gray-500">Correct inventory counts</p>
          </div>
        </Link>

        <div className="flex items-center gap-4 p-5 text-white shadow-lg bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl">
          <div className="p-3 rounded-xl bg-white/20">
            <FiAlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-semibold">Low Stock Items</h3>
            <p className="text-sm text-purple-100">
              {lowStockItems.length} items below reorder level
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
