import type { MyService } from "../types";

export const servicesMock: MyService[] = [
  {
    serviceId: "SVC-001",
    name: "Basic Eye Checkup",
    description: "Comprehensive eye examination including vision test.",
    price: 499,
    discount: 0,
    duration: "30 mins",
    homeVisit: false,
    status: "active",
  },
  {
    serviceId: "SVC-002",
    name: "Retina Screening",
    description: "Digital retina imaging and screening.",
    price: 1499,
    discount: 10,
    duration: "45 mins",
    homeVisit: false,
    status: "active",
  },
  {
    serviceId: "SVC-003",
    name: "Computer Vision Test",
    description: "Screening for digital eye strain and vision correction.",
    price: 699,
    discount: 0,
    duration: "20 mins",
    homeVisit: true,
    status: "active",
  },
  {
    serviceId: "SVC-004",
    name: "Contact Lens Fitting",
    description: "Consultation and fitting for contact lenses.",
    price: 899,
    discount: 5,
    duration: "30 mins",
    homeVisit: false,
    status: "inactive",
  },
];
