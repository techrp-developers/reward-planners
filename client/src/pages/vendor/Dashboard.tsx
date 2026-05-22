import { useState, useEffect } from "react";
import {
  FaBox,
  FaShoppingCart,
  FaWallet,
  FaPlus,
  FaEllipsisH,
  FaArrowRight,
  FaStar,
} from "react-icons/fa";
import { FiUsers, FiAlertCircle, FiCheckCircle, FiZap, FiTrendingUp, FiPackage } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/api";
import { useAuth } from "../../auth/useAuth";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function VendorDashboard() {
  const [vendorStatus, setVendorStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [productStats, setProductStats] = useState({ totalProducts: 0 });

  const { user } = useAuth();
  const navigate = useNavigate();

  const dashboardStats = [
    {
      title: "Total Revenue",
      value: "₹0",
      icon: FaWallet,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "rgba(16,185,129,0.15)",
      trend: "—",
      trendColor: "bg-gray-50 text-gray-500",
    },
    {
      title: "Total Orders",
      value: "0",
      icon: FaShoppingCart,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "rgba(59,130,246,0.15)",
      trend: "—",
      trendColor: "bg-gray-50 text-gray-500",
    },
    {
      title: "Active Products",
      value: productStats.totalProducts.toString(),
      icon: FaBox,
      color: "text-purple-600",
      bg: "bg-purple-50",
      border: "rgba(133,43,175,0.15)",
      trend: productStats.totalProducts > 0 ? `+${productStats.totalProducts}` : "—",
      trendColor: productStats.totalProducts > 0 ? "bg-purple-50 text-purple-700" : "bg-gray-50 text-gray-500",
    },
    {
      title: "Customer Rating",
      value: "—",
      icon: FiUsers,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "rgba(245,158,11,0.15)",
      trend: "—",
      trendColor: "bg-gray-50 text-gray-500",
    },
  ];

  useEffect(() => {
    fetchVendorStats();
    fetchVendorStatus();
  }, []);

  const fetchVendorStats = async () => {
    try {
      const res = await api.get("/vendor/stats");
      if (res.data?.success) {
        setProductStats({ totalProducts: res.data.stats?.approved || 0 });
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  const fetchVendorStatus = async () => {
    try {
      const res = await api.get("/vendor/my-details");
      if (res.data?.success) {
        setVendorStatus(res.data?.vendor?.status);
      } else {
        setVendorStatus(null);
      }
    } catch (error) {
      console.error("Error fetching vendor status:", error);
      setVendorStatus(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div
          className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin"
        />
        <span className="ml-4 text-gray-500 font-medium">Loading dashboard…</span>
      </div>
    );
  }

  const isApproved = vendorStatus === "approved";

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── ONBOARDING BANNER (non-approved only) ── */}
      {!isApproved && (
        <div
          className="relative overflow-hidden flex items-center justify-between gap-4 p-5 rounded-2xl"
          style={{
            background: "linear-gradient(135deg, rgba(133,43,175,0.08) 0%, rgba(252,63,120,0.06) 100%)",
            border: "1px solid rgba(133,43,175,0.2)",
          }}
        >
          <div className="pointer-events-none absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, #852BAF 0%, transparent 70%)" }} />

          <div className="flex items-center gap-4">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0"
              style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 6px 16px rgba(133,43,175,0.3)" }}
            >
              <FiAlertCircle size={20} />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Complete your vendor onboarding</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Your account is pending approval. Submit your business details to start selling.
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate("/vendor/onboarding")}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white rounded-xl shrink-0 cursor-pointer transition-all hover:opacity-90 active:scale-95"
            style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 4px 16px rgba(133,43,175,0.3)" }}
          >
            Complete Now <FaArrowRight size={11} />
          </button>
        </div>
      )}

      {/* ── PAGE HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-0.5">
            {getGreeting()}
          </p>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Vendor <span className="gradient-text-brand">Dashboard</span>
          </h1>
          <p className="text-gray-500 mt-1 font-medium text-sm">
            Welcome back,{" "}
            <span className="text-gray-800 font-bold">{user?.name || user?.email}</span>.
            Here's what's happening today.
          </p>
        </div>

        {isApproved && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/vendor/products/list")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm border border-gray-200 bg-white text-gray-700 hover:border-[#852BAF] hover:text-[#852BAF] cursor-pointer transition-all duration-200"
            >
              <FiPackage size={15} /> My Products
            </button>
            <button
              onClick={() => navigate("/vendor/products/add")}
              className="flex items-center gap-2 px-5 py-2.5 text-white font-semibold text-sm rounded-xl cursor-pointer transition-all duration-200 hover:opacity-90 active:scale-95"
              style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 6px 20px rgba(133,43,175,0.3)" }}
            >
              <FaPlus size={12} /> Add Product
            </button>
          </div>
        )}
      </div>

      {/* ── STATS GRID ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {dashboardStats.map((item, idx) => (
          <div
            key={idx}
            className="stats-card-enter bg-white p-6 rounded-2xl vendor-section-card group cursor-default"
            style={{
              animationDelay: `${idx * 80}ms`,
              border: `1px solid ${item.border}`,
              boxShadow: "0 2px 16px rgba(133,43,175,0.04)",
            }}
          >
            <div className="flex justify-between items-start">
              <div className={`p-3 rounded-2xl ${item.bg} ${item.color} group-hover:scale-110 transition-transform duration-200`}>
                <item.icon size={22} />
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded-lg ${item.trendColor}`}>
                {item.trend}
              </span>
            </div>
            <div className="mt-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                {item.title}
              </p>
              <h3
                className="stat-value-pop text-2xl font-extrabold text-gray-800 mt-1"
                style={{ animationDelay: `${idx * 80 + 120}ms` }}
              >
                {item.value}
              </h3>
            </div>
          </div>
        ))}
      </div>

      {/* ── MAIN GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* RECENT ORDERS */}
        <div
          className="lg:col-span-2 bg-white rounded-2xl overflow-hidden vendor-section-card"
          style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 2px 16px rgba(133,43,175,0.04)" }}
        >
          <div className="px-6 py-4 flex justify-between items-center border-b border-gray-50">
            <div className="flex items-center gap-2">
              <FaShoppingCart className="text-[#852BAF]" size={15} />
              <h3 className="text-base font-bold text-gray-800">Recent Orders</h3>
            </div>
            <button className="text-sm font-bold text-[#852BAF] hover:underline cursor-pointer transition-colors">
              View All
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr style={{ background: "linear-gradient(90deg, rgba(133,43,175,0.04) 0%, rgba(252,63,120,0.02) 100%)" }}>
                  <th className="px-6 py-3.5 text-xs font-bold text-gray-400 uppercase tracking-wider">Product</th>
                  <th className="px-6 py-3.5 text-xs font-bold text-gray-400 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3.5 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3.5 text-xs font-bold text-gray-400 uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={4} className="px-6 py-14 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center"
                        style={{ background: "linear-gradient(135deg, rgba(133,43,175,0.08) 0%, rgba(252,63,120,0.05) 100%)" }}
                      >
                        <FaShoppingCart className="text-[#852BAF] opacity-60" size={22} />
                      </div>
                      <p className="text-sm font-semibold text-gray-700">No orders yet</p>
                      <p className="text-xs text-gray-400">
                        Orders will appear here once customers start purchasing.
                      </p>
                      {isApproved && (
                        <button
                          onClick={() => navigate("/vendor/products/add")}
                          className="mt-1 flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl text-white cursor-pointer hover:opacity-90"
                          style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
                        >
                          <FaPlus size={9} /> Add Your First Product
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* PERFORMANCE CARD */}
        <div
          className="rounded-2xl p-7 text-white relative overflow-hidden flex flex-col justify-between"
          style={{ background: "linear-gradient(135deg, #852BAF 0%, #5a1d7a 100%)", boxShadow: "0 8px 32px rgba(133,43,175,0.25)" }}
        >
          {/* Decorative blobs */}
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white opacity-[0.07] rounded-full" />
          <div className="absolute -bottom-12 -left-8 w-36 h-36 bg-white opacity-[0.05] rounded-full" />

          <div className="relative">
            <div className="flex justify-between items-start mb-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1">Performance</p>
                <h3 className="text-lg font-bold">Store Rating</h3>
              </div>
              <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center cursor-pointer hover:bg-white/20 transition-colors">
                <FaEllipsisH className="opacity-60" size={13} />
              </div>
            </div>

            <div className="flex items-end gap-2">
              <h2 className="text-5xl font-extrabold tracking-tighter">0</h2>
              <div className="mb-2 flex gap-0.5">
                {[1, 2, 3, 4, 5].map((s) => (
                  <FaStar key={s} size={10} className="opacity-25" />
                ))}
              </div>
            </div>
            <p className="mt-1 opacity-60 text-xs">No ratings received yet</p>
          </div>

          <div className="relative mt-8 space-y-4">
            {/* Profile Strength */}
            <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-widest opacity-80">Profile Strength</span>
                <span className="text-xs font-bold opacity-90">0%</span>
              </div>
              <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden">
                <div className="bg-white h-full w-[0%] rounded-full transition-all duration-1000" />
              </div>
            </div>

            {/* Quick links */}
            {isApproved && (
              <div className="flex gap-2">
                <button
                  onClick={() => navigate("/vendor/products/add")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl bg-white/15 hover:bg-white/25 transition-colors cursor-pointer border border-white/20"
                >
                  <FiZap size={11} /> Add Product
                </button>
                <button
                  onClick={() => navigate("/vendor/orders/summary")}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-bold rounded-xl bg-white/15 hover:bg-white/25 transition-colors cursor-pointer border border-white/20"
                >
                  <FiTrendingUp size={11} /> Orders
                </button>
              </div>
            )}

            {/* Approved badge */}
            {isApproved && (
              <div className="flex items-center gap-2 py-2 px-3 rounded-xl bg-white/10 border border-white/15">
                <FiCheckCircle size={13} className="text-emerald-300 shrink-0" />
                <span className="text-xs font-medium opacity-80">Account verified & active</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
