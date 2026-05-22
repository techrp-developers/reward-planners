import DashboardCharts from "../../chart/manager/ManagerChart";
import { useState, useEffect } from "react";
import { api } from "../../api/api";
import { FaUsers, FaBox, FaClock, FaRupeeSign } from "react-icons/fa";
import { FiGrid } from "react-icons/fi";

export default function ManagerDashboard() {
  const [managerStats, setManagerStats] = useState({
    totalVendors: 0,
    totalProducts: 0,
    totalPending: 0,
    totalRevenue: 0,
  });

  useEffect(() => {
    fetchVendorStats();
  }, []);

  const fetchVendorStats = async () => {
    try {
      const res = await api.get("/manager/stats");

      if (res.data?.success) {
        setManagerStats({
          totalVendors: res.data?.data?.totalVendors || 0,
          totalProducts: res.data?.data?.totalProducts || 0,
          totalPending: res.data?.data?.sentForApproval || 0,
          totalRevenue: res.data?.data?.totalRevenue || 0,
        });
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  };

  return (
    <div className="w-full min-h-screen ">
      {/* Header */}
      <div className="flex items-start mb-8">
  <div className="w-12 h-12 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] rounded-full flex items-center justify-center mr-4 shrink-0">
    <FiGrid className="text-xl text-white" />
  </div>

  <div>
    <h1 className="text-3xl font-bold text-gray-900">Manager Dashboard</h1>
    <p className="mt-1 text-sm text-gray-500">
      Overview of platform performance and activity
    </p>
  </div>
</div>


      {/* Stats */}
      <div className="grid grid-cols-1 gap-6 mb-10 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: "Total Vendors",
            value: managerStats.totalVendors,
            icon: FaUsers,
            color: "from-purple-500 to-purple-700",
          },
          {
            title: "Total Products",
            value: managerStats.totalProducts,
            icon: FaBox,
            color: "from-indigo-500 to-indigo-700",
          },
          {
            title: "Total Revenue",
            value: `₹${managerStats.totalRevenue}`,
            icon: FaRupeeSign,
            color: "from-pink-500 to-pink-700",
          },
          {
            title: "Pending Vendor Approvals",
            value: managerStats.totalPending,
            icon: FaClock,
            color: "from-amber-500 to-amber-700",
          },
        ].map((card, idx) => {
          const Icon = card.icon;
          return (
            <div
              key={idx}
              className={`relative overflow-hidden rounded-2xl p-6 text-white shadow-lg bg-gradient-to-br ${card.color}`}
            >
              <div className="absolute top-0 right-0 w-32 h-32 -mt-16 -mr-16 bg-white rounded-full opacity-20" />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">{card.title}</p>
                  <p className="mt-2 text-3xl font-bold">{card.value}</p>
                </div>

                <div className="p-3 bg-white/20 rounded-xl">
                  <Icon className="text-2xl" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Content Section */}

      <DashboardCharts />
    </div>
  );
}
