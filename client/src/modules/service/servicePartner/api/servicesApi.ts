import { servicesMock } from "../mock/services.mock";
import { delay } from "./mockUtils";
import type { MyService } from "../types";

let services: MyService[] = [...servicesMock];

const nextServiceId = () => {
  const maxNum = services.reduce((max, s) => {
    const n = parseInt(s.serviceId.split("-")[1], 10);
    return Number.isNaN(n) ? max : Math.max(max, n);
  }, 0);
  return `SVC-${String(maxNum + 1).padStart(3, "0")}`;
};

export const servicesApi = {
  async list() {
    await delay();
    return { data: { success: true, data: [...services] } };
  },

  async getById(serviceId: string) {
    await delay(250);
    const found = services.find((s) => s.serviceId === serviceId) ?? null;
    return { data: { success: !!found, data: found } };
  },

  async create(input: Omit<MyService, "serviceId">) {
    await delay();
    const service: MyService = { ...input, serviceId: nextServiceId() };
    services = [service, ...services];
    return { data: { success: true, data: service } };
  },

  async update(serviceId: string, input: Omit<MyService, "serviceId">) {
    await delay();
    let updated: MyService | null = null;
    services = services.map((s) => {
      if (s.serviceId !== serviceId) return s;
      updated = { ...s, ...input, serviceId: s.serviceId };
      return updated;
    });
    return { data: { success: !!updated, data: updated } };
  },

  async remove(serviceId: string) {
    await delay(250);
    services = services.filter((s) => s.serviceId !== serviceId);
    return { data: { success: true } };
  },
};
