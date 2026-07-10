import { partnerManagersMock } from "../mock/partnerManagers.mock";
import type { PartnerManager, PartnerManagerInput } from "../types";

let managers: PartnerManager[] = [...partnerManagersMock];

const delay = (ms = 400) => new Promise((resolve) => setTimeout(resolve, ms));

const nextManagerId = () => {
  const maxNum = managers.reduce((max, m) => {
    const n = parseInt(m.managerId.split("-")[1], 10);
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return `PM-${String(maxNum + 1).padStart(3, "0")}`;
};

export const partnerManagersApi = {
  async list() {
    await delay();
    return { data: { success: true, data: [...managers] } };
  },

  async getById(managerId: string) {
    await delay(250);
    const found = managers.find((m) => m.managerId === managerId) ?? null;
    return { data: { success: !!found, data: found } };
  },

  async create(input: PartnerManagerInput) {
    await delay();
    const manager: PartnerManager = { ...input, managerId: nextManagerId() };
    managers = [manager, ...managers];
    return { data: { success: true, data: manager } };
  },

  async update(managerId: string, input: PartnerManagerInput) {
    await delay();
    let updated: PartnerManager | null = null;
    managers = managers.map((m) => {
      if (m.managerId !== managerId) return m;
      updated = { ...m, ...input, managerId: m.managerId };
      return updated;
    });
    return { data: { success: !!updated, data: updated } };
  },
};
