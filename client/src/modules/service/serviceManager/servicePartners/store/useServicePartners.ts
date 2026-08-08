import { useCallback, useEffect, useMemo, useState } from "react";
import { servicePartnersApi } from "../api/servicePartnersApi";
import type { ServicePartner, ServicePartnerInput } from "../types";

export interface ServicePartnerFilterState {
  category: string;
  subCategory: string;
  status: string;
  city: string;
  search: string;
}

export const defaultServicePartnerFilters: ServicePartnerFilterState = {
  category: "All",
  subCategory: "All",
  status: "All",
  city: "All",
  search: "",
};

export function useServicePartners(initialFilters?: Partial<ServicePartnerFilterState>) {
  const [partners, setPartners] = useState<ServicePartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ServicePartnerFilterState>({
    ...defaultServicePartnerFilters,
    ...initialFilters,
  });

  const fetchPartners = useCallback(async () => {
    try {
      setLoading(true);
      const res = await servicePartnersApi.list();
      if (res.data.success) setPartners(res.data.data);
    } catch (err) {
      console.error("Error loading service partners:", err);
      setError("Failed to load service partners.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  const createPartner = useCallback(
    async (input: ServicePartnerInput) => {
      const res = await servicePartnersApi.create(input);
      if (res.data.success) await fetchPartners();
      return res.data;
    },
    [fetchPartners],
  );

  const updatePartner = useCallback(
    async (partnerId: string, input: ServicePartnerInput) => {
      const res = await servicePartnersApi.update(partnerId, input);
      if (res.data.success) await fetchPartners();
      return res.data;
    },
    [fetchPartners],
  );

  const removePartner = useCallback(
    async (partnerId: string) => {
      const res = await servicePartnersApi.remove(partnerId);
      if (res.data.success) await fetchPartners();
      return res.data;
    },
    [fetchPartners],
  );

  const filteredPartners = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return partners.filter((p) => {
      const matchesCategory = filters.category === "All" || p.category === filters.category;
      const matchesSubCategory =
        filters.subCategory === "All" || p.subCategory === filters.subCategory;
      const matchesStatus = filters.status === "All" || p.status === filters.status;
      const matchesCity = filters.city === "All" || p.city === filters.city;
      const matchesSearch =
        !q ||
        p.partnerName.toLowerCase().includes(q) ||
        p.partnerCode.toLowerCase().includes(q) ||
        p.contact.email.toLowerCase().includes(q);
      return matchesCategory && matchesSubCategory && matchesStatus && matchesCity && matchesSearch;
    });
  }, [partners, filters]);

  const cities = useMemo(
    () => Array.from(new Set(partners.map((p) => p.city))).sort(),
    [partners],
  );

  return {
    partners,
    filteredPartners,
    loading,
    error,
    filters,
    setFilters,
    cities,
    fetchPartners,
    createPartner,
    updatePartner,
    removePartner,
  };
}
