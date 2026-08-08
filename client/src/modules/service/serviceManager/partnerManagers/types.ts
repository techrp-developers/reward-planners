export interface PartnerManager {
  managerId: string;
  name: string;
  region: string;
  assignedPartners: string[];
}

export type PartnerManagerInput = Omit<PartnerManager, "managerId"> & {
  managerId?: string;
};
