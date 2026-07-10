import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Doughnut } from "react-chartjs-2";
import {
  FaBriefcase,
  FaWallet,
  FaStar,
  FaBell,
} from "react-icons/fa";
import { FiCalendar, FiClock, FiCheckCircle, FiXCircle } from "react-icons/fi";
import { useAuth } from "../../../../../common/auth/useAuth";
import { useMyServices } from "../../store/useMyServices";
import { useMyBookings } from "../../store/useMyBookings";
import { useMyReviews } from "../../store/useMyReviews";
import StatCard from "../../components/StatCard";
import { BookingStatusChip } from "../../components/StatusChips";

ChartJS.register(ArcElement, Tooltip, Legend);

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const notifications = [
  { id: 1, text: "New booking received from Ananya Rao for Basic Eye Checkup.", time: "2h ago" },
  { id: 2, text: "Payment of ₹1,349 confirmed for booking BK-1002.", time: "5h ago" },
  { id: 3, text: "Karan Kapoor left a review on your service.", time: "1d ago" },
];

export default function ServicePartnerDashboard() {
  const { user } = useAuth();
  const { services, loading: servicesLoading } = useMyServices();
  const { bookings, loading: bookingsLoading } = useMyBookings();
  const { reviews, loading: reviewsLoading } = useMyReviews();

  const loading = servicesLoading || bookingsLoading || reviewsLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
        <span className="ml-4 font-medium text-gray-500">Loading dashboard…</span>
      </div>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const todaysBookings = bookings.filter((b) => b.bookingDate === today).length;
  const pendingBookings = bookings.filter((b) => b.bookingStatus === "upcoming").length;
  const completedBookings = bookings.filter((b) => b.bookingStatus === "completed").length;
  const cancelledBookings = bookings.filter((b) => b.bookingStatus === "cancelled").length;
  const revenue = bookings
    .filter((b) => b.paymentStatus === "paid")
    .reduce((sum, b) => sum + b.amount, 0);
  const avgRating = reviews.length
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : "—";

  const recentBookings = [...bookings]
    .sort((a, b) => (a.bookingDate < b.bookingDate ? 1 : -1))
    .slice(0, 5);
  const latestReviews = [...reviews]
    .sort((a, b) => (a.reviewDate < b.reviewDate ? 1 : -1))
    .slice(0, 3);

  const statusChartData = {
    labels: ["Upcoming", "Completed", "Cancelled"],
    datasets: [
      {
        data: [pendingBookings, completedBookings, cancelledBookings],
        backgroundColor: ["#3B82F6", "#10B981", "#EF4444"],
      },
    ],
  };

  const stats = [
    {
      title: "Total Services",
      value: services.length.toString(),
      Icon: FaBriefcase,
      color: "text-purple-600",
      bg: "bg-purple-50",
      border: "rgba(133,43,175,0.15)",
    },
    {
      title: "Today's Bookings",
      value: todaysBookings.toString(),
      Icon: FiCalendar,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "rgba(59,130,246,0.15)",
    },
    {
      title: "Pending Bookings",
      value: pendingBookings.toString(),
      Icon: FiClock,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "rgba(245,158,11,0.15)",
    },
    {
      title: "Completed Bookings",
      value: completedBookings.toString(),
      Icon: FiCheckCircle,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "rgba(16,185,129,0.15)",
    },
    {
      title: "Cancelled Bookings",
      value: cancelledBookings.toString(),
      Icon: FiXCircle,
      color: "text-red-600",
      bg: "bg-red-50",
      border: "rgba(239,68,68,0.15)",
    },
    {
      title: "Revenue",
      value: `₹${revenue.toLocaleString("en-IN")}`,
      Icon: FaWallet,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "rgba(16,185,129,0.15)",
    },
    {
      title: "Average Rating",
      value: avgRating,
      Icon: FaStar,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "rgba(245,158,11,0.15)",
    },
  ];

  return (
    <div className="mx-auto space-y-6 max-w-7xl">
      {/* ── PAGE HEADER ── */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-0.5">
            {getGreeting()}
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
            Service Partner <span className="gradient-text-brand">Dashboard</span>
          </h1>
          <p className="mt-1 text-sm font-medium text-gray-500">
            Welcome back, <span className="font-bold text-gray-800">{user?.name || user?.email}</span>.
            Here's what's happening today.
          </p>
        </div>
      </div>

      {/* ── STATS GRID ── */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((item, idx) => (
          <StatCard key={item.title} {...item} delayMs={idx * 80} />
        ))}
      </div>

      {/* ── MAIN GRID ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* RECENT BOOKINGS */}
        <div
          className="overflow-hidden bg-white lg:col-span-2 rounded-2xl vendor-section-card"
          style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 2px 16px rgba(133,43,175,0.04)" }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2">
              <FiCalendar className="text-[#852BAF]" size={15} />
              <h3 className="text-base font-bold text-gray-800">Recent Bookings</h3>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr style={{ background: "linear-gradient(90deg, rgba(133,43,175,0.04) 0%, rgba(252,63,120,0.02) 100%)" }}>
                  <th className="px-6 py-3.5 text-xs font-bold text-gray-400 uppercase tracking-wider">Employee</th>
                  <th className="px-6 py-3.5 text-xs font-bold text-gray-400 uppercase tracking-wider">Service</th>
                  <th className="px-6 py-3.5 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3.5 text-xs font-bold text-gray-400 uppercase tracking-wider">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentBookings.map((b) => (
                  <tr key={b.bookingId} className="hover:bg-purple-50/20 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-gray-900">{b.employeeName}</p>
                      <p className="text-xs text-gray-400">{b.company}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{b.service}</td>
                    <td className="px-6 py-4">
                      <BookingStatusChip status={b.bookingStatus} />
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-gray-800">
                      ₹{b.amount.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* BOOKING STATUS CHART */}
        <div
          className="bg-white rounded-2xl p-6 vendor-section-card"
          style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 2px 16px rgba(133,43,175,0.04)" }}
        >
          <h3 className="mb-4 text-base font-bold text-gray-800">Booking Status</h3>
          <Doughnut data={statusChartData} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* LATEST REVIEWS */}
        <div
          className="bg-white rounded-2xl overflow-hidden vendor-section-card"
          style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 2px 16px rgba(133,43,175,0.04)" }}
        >
          <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-50">
            <FaStar className="text-[#852BAF]" size={14} />
            <h3 className="text-base font-bold text-gray-800">Latest Reviews</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {latestReviews.map((r) => (
              <div key={r.reviewId} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">{r.employeeName}</p>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600">
                    <FaStar size={11} /> {r.rating}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{r.service}</p>
                <p className="text-sm text-gray-600 mt-1.5">{r.comment}</p>
              </div>
            ))}
          </div>
        </div>

        {/* RECENT NOTIFICATIONS */}
        <div
          className="bg-white rounded-2xl overflow-hidden vendor-section-card"
          style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 2px 16px rgba(133,43,175,0.04)" }}
        >
          <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-50">
            <FaBell className="text-[#852BAF]" size={14} />
            <h3 className="text-base font-bold text-gray-800">Recent Notifications</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {notifications.map((n) => (
              <div key={n.id} className="px-6 py-4 flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0"
                  style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)" }}
                >
                  <FaBell size={11} />
                </div>
                <div>
                  <p className="text-sm text-gray-700">{n.text}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{n.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
