import { useCallback, useEffect, useState } from "react";
import { bookingsApi } from "../api/bookingsApi";
import type { Booking } from "../types";

export function useMyBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    const res = await bookingsApi.list();
    if (res.data.success) setBookings(res.data.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  return { bookings, loading, fetchBookings };
}
