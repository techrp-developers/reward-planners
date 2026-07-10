// Shared taxonomy for the Services vertical. Categories/Sub-categories are
// conceptually shared with ecommerce (type: "product" | "service") but the
// live Category/Sub-category screens are wired to a real backend endpoint
// with no "type" column yet, so this module keeps the service-side taxonomy
// local rather than touching that backend-integrated CRUD.

export type CategoryType = "product" | "service";

export interface ServiceCategory {
  slug: string;
  name: string;
  type: CategoryType;
  subCategories: string[];
}

export const serviceCategories: ServiceCategory[] = [
  {
    slug: "healthcare",
    name: "Healthcare",
    type: "service",
    subCategories: ["Eye Checkup", "Blood Test", "Dental", "Physiotherapy"],
  },
  {
    slug: "government-documents",
    name: "Government Documents",
    type: "service",
    subCategories: ["PAN Card", "Aadhaar", "Passport", "Driving License"],
  },
  {
    slug: "food-tiffin",
    name: "Food / Tiffin",
    type: "service",
    subCategories: ["Tiffin Service", "Cloud Kitchen", "Catering"],
  },
  {
    slug: "electronics-repair",
    name: "Electronics Repair",
    type: "service",
    subCategories: ["AC Repair", "Laptop Repair", "TV Repair"],
  },
];

export const getSubCategories = (categoryName: string): string[] =>
  serviceCategories.find((c) => c.name === categoryName)?.subCategories ?? [];
