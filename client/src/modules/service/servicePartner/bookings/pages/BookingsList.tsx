import { useState } from "react";
import { Link } from "react-router-dom";
import { FiEye, FiCalendar } from "react-icons/fi";
import { FaFileAlt } from "react-icons/fa";
import { routes } from "../../../../../routes";
import { useMyBookings } from "../../store/useMyBookings";
import { BookingStatusChip, PaymentStatusChip } from "../../components/StatusChips";
import type { BookingStatus } from "../../types";

const inputCls =
  "px-4 py-2.5 bg-gray-50/60 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:ring-4 focus:ring-[#852BAF]/15 focus:border-[#852BAF] focus:bg-white transition-all";

type FilterValue = "All" | BookingStatus;

export default function BookingsList() {
  const { bookings, loading } = useMyBookings();
  const [filter, setFilter] = useState<FilterValue>("All");

  const filteredBookings = bookings.filter((b) => filter === "All" || b.bookingStatus === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div
        className="flex items-center justify-between p-5 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0"
            style={{ background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)", boxShadow: "0 6px 20px rgba(133,43,175,0.25)" }}
          >
            <FiCalendar size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Bookings</h1>
            <p className="text-xs text-gray-500 font-medium mt-0.5">Employee bookings for your services</p>
          </div>
        </div>

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterValue)}
          className={`${inputCls} cursor-pointer`}
        >
          <option value="All">All Status</option>
          <option value="upcoming">Upcoming</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{ border: "1px solid rgba(133,43,175,0.08)", boxShadow: "0 4px 24px rgba(133,43,175,0.06)" }}
      >
        <table className="min-w-full">
          <thead>
            <tr style={{ background: "linear-gradient(90deg, rgba(133,43,175,0.04) 0%, rgba(252,63,120,0.02) 100%)" }}>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Booking</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Employee</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Service</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Date &amp; Time</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Amount</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Payment</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredBookings.map((b) => (
              <tr key={b.bookingId} className="hover:bg-purple-50/20 transition-colors">
                <td className="px-6 py-4 text-sm font-semibold text-gray-900">{b.bookingId}</td>
                <td className="px-6 py-4">
                  <p className="text-sm font-semibold text-gray-900">{b.employeeName}</p>
                  <p className="text-xs text-gray-400">{b.company}</p>
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">{b.service}</td>
                <td className="px-6 py-4">
                  <p className="text-sm text-gray-700">{new Date(b.bookingDate).toLocaleDateString()}</p>
                  <p className="text-xs text-gray-400">{b.timeSlot}</p>
                </td>
                <td className="px-6 py-4 text-sm font-bold text-gray-800">₹{b.amount.toLocaleString("en-IN")}</td>
                <td className="px-6 py-4">
                  <PaymentStatusChip status={b.paymentStatus} />
                </td>
                <td className="px-6 py-4">
                  <BookingStatusChip status={b.bookingStatus} />
                </td>
                <td className="px-6 py-4">
                  <Link to={routes.servicePartner.bookings.details.replace(":bookingId", b.bookingId)}>
                    <button className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-gray-500 bg-white border border-gray-100 hover:text-[#852BAF] rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer">
                      <FiEye size={11} /> View
                    </button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredBookings.length === 0 && (
          <div className="py-16 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: "linear-gradient(135deg, rgba(133,43,175,0.08) 0%, rgba(252,63,120,0.05) 100%)" }}
            >
              <FaFileAlt className="text-[#852BAF] opacity-50" size={24} />
            </div>
            <h3 className="text-base font-bold text-gray-700 mb-1">No Bookings Found</h3>
          </div>
        )}
      </div>
    </div>
  );
}
