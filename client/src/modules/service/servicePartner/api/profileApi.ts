import { profileMock } from "../mock/profile.mock";
import { delay } from "./mockUtils";
import type { PartnerProfile } from "../types";

let profile: PartnerProfile = { ...profileMock };

export const profileApi = {
  async get() {
    await delay(300);
    return { data: { success: true, data: profile } };
  },

  async update(input: PartnerProfile) {
    await delay();
    profile = { ...profile, ...input };
    return { data: { success: true, data: profile } };
  },
};
