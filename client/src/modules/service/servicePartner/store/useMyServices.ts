import { useCallback, useEffect, useMemo, useState } from "react";
import { servicesApi } from "../api/servicesApi";
import type { MyService } from "../types";

export function useMyServices() {
  const [services, setServices] = useState<MyService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | MyService["status"]>("All");

  const fetchServices = useCallback(async () => {
    setLoading(true);
    const res = await servicesApi.list();
    if (res.data.success) setServices(res.data.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  const createService = useCallback(
    async (input: Omit<MyService, "serviceId">) => {
      const res = await servicesApi.create(input);
      if (res.data.success) await fetchServices();
      return res.data;
    },
    [fetchServices],
  );

  const updateService = useCallback(
    async (serviceId: string, input: Omit<MyService, "serviceId">) => {
      const res = await servicesApi.update(serviceId, input);
      if (res.data.success) await fetchServices();
      return res.data;
    },
    [fetchServices],
  );

  const removeService = useCallback(
    async (serviceId: string) => {
      const res = await servicesApi.remove(serviceId);
      if (res.data.success) await fetchServices();
      return res.data;
    },
    [fetchServices],
  );

  const filteredServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) => {
      const matchesStatus = statusFilter === "All" || s.status === statusFilter;
      const matchesSearch = !q || s.name.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [services, search, statusFilter]);

  return {
    services,
    filteredServices,
    loading,
    search,
    setSearch,
    statusFilter,
    setStatusFilter,
    fetchServices,
    createService,
    updateService,
    removeService,
  };
}
