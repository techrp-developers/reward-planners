import type { PartnerProfile } from "../types";

export type OnboardingFormErrors = Partial<
  Record<
    | "businessName"
    | "ownerName"
    | "category"
    | "subCategory"
    | "phone"
    | "email"
    | "address"
    | "city"
    | "state"
    | "gst"
    | "pan",
    string
  >
>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const gstPattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][Z][0-9A-Z]$/;
const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function validateOnboarding(input: PartnerProfile): OnboardingFormErrors {
  const errors: OnboardingFormErrors = {};

  if (!input.businessName.trim()) errors.businessName = "Business name is required.";
  if (!input.ownerName.trim()) errors.ownerName = "Owner name is required.";
  if (!input.category) errors.category = "Category is required.";
  if (!input.subCategory) errors.subCategory = "Sub-category is required.";
  if (!input.address.trim()) errors.address = "Address is required.";
  if (!input.city.trim()) errors.city = "City is required.";
  if (!input.state.trim()) errors.state = "State is required.";

  if (!input.phone.trim()) errors.phone = "Phone number is required.";

  if (!input.email.trim()) {
    errors.email = "Email is required.";
  } else if (!emailPattern.test(input.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  if (input.gst.trim() && !gstPattern.test(input.gst.trim().toUpperCase())) {
    errors.gst = "Enter a valid 15-character GSTIN.";
  }

  if (input.pan.trim() && !panPattern.test(input.pan.trim().toUpperCase())) {
    errors.pan = "Enter a valid 10-character PAN.";
  }

  return errors;
}

export const hasOnboardingErrors = (errors: OnboardingFormErrors) => Object.keys(errors).length > 0;
