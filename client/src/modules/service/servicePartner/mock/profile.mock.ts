import type { PartnerProfile } from "../types";

export const profileMock: PartnerProfile = {
  partnerId: "SP-0001",
  businessName: "Sharma Eye Care Centre",
  ownerName: "Rakesh Sharma",
  phone: "+91 98200 11223",
  email: "partner@service.com",
  address: "12 Linking Road, Bandra West",
  city: "Mumbai",
  state: "Maharashtra",
  category: "Healthcare",
  subCategory: "Eye Checkup",
  gst: "27ABCDE1234F1Z5",
  pan: "ABCDE1234F",
  bank: {
    accountHolder: "Rakesh Sharma",
    accountNumber: "0123456789012",
    ifscCode: "HDFC0001234",
    bankName: "HDFC Bank",
  },
  status: "active",
  joinedDate: "2026-01-12",
  profileImage: null,
};
