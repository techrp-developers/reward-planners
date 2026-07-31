import { bookingsMock } from "../mock/bookings.mock";
import { delay } from "./mockUtils";

const bookings = [...bookingsMock];

export const bookingsApi = {
  async list() {
    await delay();
    return { data: { success: true, data: [...bookings] } };
  },

  async getById(bookingId: string) {
    await delay(250);
    const found = bookings.find((b) => b.bookingId === bookingId) ?? null;
    return { data: { success: !!found, data: found } };
  },
};
