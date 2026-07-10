import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiArrowLeft, FiCalendar, FiClock, FiBriefcase } from "react-icons/fi";
import { FaBuilding, FaUser } from "react-icons/fa";
import { routes } from "../../../../../routes";
import { bookingsApi } from "../../api/bookingsApi";
import { BookingStatusChip, PaymentStatusChip } from "../../components/StatusChips";
import type { Booking } from "../../types";

export default function BookingDetails() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookingId) return;
    (async () => {
      const res = await bookingsApi.getById(bookingId);
      if (res.data.success) setBooking(res.data.data);
      setLoading(false);
    })();
  }, [bookingId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-[3px] border-transparent border-t-[#852BAF] border-r-[#FC3F78] rounded-full animate-spin" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center">
        <h2 className="text-xl font-bold text-gray-700">Booking not found</h2>
        <Link to={routes.servicePartner.bookings.list} className="text-[#852BAF] font-semibold mt-2 inline-block">
          Back to bookings
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        to={routes.servicePartner.bookings.list}
        className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-[#852BAF]"
      >
        <FiArrowLeft /> Back to Bookings
      </Link>

      <div
        className="p-6 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.1)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">{booking.bookingId}</h1>
            <p className="text-xs text-gray-500 font-medium mt-0.5">{booking.service}</p>
          </div>
          <div className="flex items-center gap-2">
            <BookingStatusChip status={booking.bookingStatus} />
            <PaymentStatusChip status={booking.paymentStatus} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.04)] space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <FaUser size={10} /> Employee
            </p>
            <p className="text-sm font-semibold text-gray-800">{booking.employeeName}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <FaBuilding size={10} /> Company
            </p>
            <p className="text-sm font-semibold text-gray-800">{booking.company}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <FiBriefcase size={11} /> Service
            </p>
            <p className="text-sm font-semibold text-gray-800">{booking.service}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Amount</p>
            <p className="text-sm font-bold text-[#852BAF]">₹{booking.amount.toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <FiCalendar size={11} /> Booking Date
            </p>
            <p className="text-sm font-semibold text-gray-800">
              {new Date(booking.bookingDate).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
              <FiClock size={11} /> Time Slot
            </p>
            <p className="text-sm font-semibold text-gray-800">{booking.timeSlot}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
