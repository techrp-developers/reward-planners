import type { ServicePartnerInput } from "../types";

export type ServicePartnerFormErrors = Partial<
  Record<
    "partnerName" | "category" | "subCategory" | "city" | "managedBy" | "phone" | "email" | "services",
    string
  >
>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateServicePartner(input: ServicePartnerInput): ServicePartnerFormErrors {
  const errors: ServicePartnerFormErrors = {};

  if (!input.partnerName.trim()) errors.partnerName = "Partner name is required.";
  if (!input.category) errors.category = "Category is required.";
  if (!input.subCategory) errors.subCategory = "Sub-category is required.";
  if (!input.city.trim()) errors.city = "City is required.";
  if (!input.managedBy) errors.managedBy = "Assign a partner manager.";

  if (!input.contact.phone.trim()) errors.phone = "Phone number is required.";
  if (!input.contact.email.trim()) {
    errors.email = "Email is required.";
  } else if (!emailPattern.test(input.contact.email.trim())) {
    errors.email = "Enter a valid email address.";
  }

  const validServices = input.services.filter((s) => s.label.trim() && s.rate > 0);
  if (validServices.length === 0) {
    errors.services = "Add at least one rate card entry with a label and rate.";
  }

  return errors;
}

export const hasServicePartnerErrors = (errors: ServicePartnerFormErrors) =>
  Object.keys(errors).length > 0;
