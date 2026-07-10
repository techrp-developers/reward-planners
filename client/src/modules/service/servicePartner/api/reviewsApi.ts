import { reviewsMock } from "../mock/reviews.mock";
import { delay } from "./mockUtils";

export const reviewsApi = {
  async list() {
    await delay();
    return { data: { success: true, data: [...reviewsMock] } };
  },
};
