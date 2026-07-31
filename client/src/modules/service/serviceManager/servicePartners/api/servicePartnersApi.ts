// Mirrors the shape of calls made through `common/api/api.ts` (res.data.success /
// res.data.data) so components read the same way as VendorApprovalList.tsx does,
// but backed by static mock data until a real Service Partner backend exists.

import { servicePartnersMock } from "../mock/servicePartners.mock";
import type { ServicePartner, ServicePartnerInput } from "../types";

let partners: ServicePartner[] = [...servicePartnersMock];

const delay = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

const nextPartnerId = () => {
  const maxNum = partners.reduce((max, p) => {
    const n = parseInt(p.partnerId.split("-")[1], 10);
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return `SP-${String(maxNum + 1).padStart(4, "0")}`;
};

const buildPartnerCode = (input: ServicePartnerInput, partnerId: string) => {
  const catAbbr = input.category.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase();
  const subAbbr = input.subCategory.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  const nameAbbr = (input.partnerName.split(" ")[0] || "PARTNER").slice(0, 8).toUpperCase();
  const cityAbbr = input.city.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  return `${catAbbr}-${subAbbr}-${nameAbbr}-${cityAbbr}-${partnerId.split("-")[1]}`;
};

export const servicePartnersApi = {
  async list() {
    await delay();
    return { data: { success: true, data: [...partners] } };
  },

  async getById(partnerId: string) {
    await delay(250);
    const found = partners.find((p) => p.partnerId === partnerId) ?? null;
    return { data: { success: !!found, data: found } };
  },

  async create(input: ServicePartnerInput) {
    await delay();
    const partnerId = nextPartnerId();
    const partner: ServicePartner = {
      ...input,
      partnerId,
      partnerCode: buildPartnerCode(input, partnerId),
      onboardedOn: new Date().toISOString().slice(0, 10),
    };
    partners = [partner, ...partners];
    return { data: { success: true, data: partner } };
  },

  async update(partnerId: string, input: ServicePartnerInput) {
    await delay();
    let updated: ServicePartner | null = null;
    partners = partners.map((p) => {
      if (p.partnerId !== partnerId) return p;
      updated = {
        ...p,
        ...input,
        partnerId: p.partnerId,
        partnerCode: p.partnerCode,
        onboardedOn: p.onboardedOn,
      };
      return updated;
    });
    return { data: { success: !!updated, data: updated } };
  },

  async remove(partnerId: string) {
    await delay(250);
    partners = partners.filter((p) => p.partnerId !== partnerId);
    return { data: { success: true } };
  },
};
