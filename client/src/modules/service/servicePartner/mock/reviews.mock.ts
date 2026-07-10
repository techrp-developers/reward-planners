import type { Review } from "../types";

export const reviewsMock: Review[] = [
  {
    reviewId: "RV-001",
    employeeName: "Ananya Rao",
    service: "Basic Eye Checkup",
    rating: 5,
    comment: "Very thorough checkup, staff was friendly and professional.",
    reviewDate: "2026-07-05",
  },
  {
    reviewId: "RV-002",
    employeeName: "Sneha Iyer",
    service: "Contact Lens Fitting",
    rating: 4,
    comment: "Good experience overall, slight wait time.",
    reviewDate: "2026-06-21",
  },
  {
    reviewId: "RV-003",
    employeeName: "Karan Kapoor",
    service: "Basic Eye Checkup",
    rating: 3,
    comment: "Booking was cancelled, had to reschedule elsewhere.",
    reviewDate: "2026-06-29",
  },
];
