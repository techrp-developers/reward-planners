export type ServicePartnerStatus = "active" | "pending" | "suspended";

export interface ServicePartnerContact {
  phone: string;
  email: string;
  address: string;
}

export interface ServiceRateCardItem {
  label: string;
  rate: number;
}

export interface ServicePartner {
  partnerId: string;
  partnerCode: string;
  partnerName: string;
  category: string;
  subCategory: string;
  managedBy: string;
  city: string;
  contact: ServicePartnerContact;
  services: ServiceRateCardItem[];
  status: ServicePartnerStatus;
  rating: number;
  onboardedOn: string;
}

export type ServicePartnerInput = Omit<ServicePartner, "partnerId" | "partnerCode" | "onboardedOn"> & {
  partnerId?: string;
  partnerCode?: string;
  onboardedOn?: string;
};
