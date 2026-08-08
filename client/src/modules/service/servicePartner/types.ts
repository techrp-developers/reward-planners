export type PartnerStatus = "active" | "pending" | "suspended";

export interface BankDetails {
  accountHolder: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
}

export interface PartnerProfile {
  partnerId: string;
  businessName: string;
  ownerName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  category: string;
  subCategory: string;
  gst: string;
  pan: string;
  bank: BankDetails;
  status: PartnerStatus;
  joinedDate: string;
  profileImage: string | null;
}

export type ServiceStatus = "active" | "inactive";

export interface MyService {
  serviceId: string;
  name: string;
  description: string;
  price: number;
  discount: number;
  duration: string;
  homeVisit: boolean;
  status: ServiceStatus;
}

export type BookingPaymentStatus = "paid" | "pending" | "refunded";
export type BookingStatus = "upcoming" | "completed" | "cancelled";

export interface Booking {
  bookingId: string;
  employeeName: string;
  company: string;
  service: string;
  bookingDate: string;
  timeSlot: string;
  amount: number;
  paymentStatus: BookingPaymentStatus;
  bookingStatus: BookingStatus;
}

export interface Review {
  reviewId: string;
  employeeName: string;
  service: string;
  rating: number;
  comment: string;
  reviewDate: string;
}

export type DocumentKey =
  | "gstCertificate"
  | "panCard"
  | "agreement"
  | "cancelledCheque"
  | "bankDetails"
  | "aadhaar"
  | "passport";

export interface DocumentItem {
  key: DocumentKey;
  label: string;
  fileName: string | null;
  uploadedOn: string | null;
  url: string | null;
}
