import { useCallback, useEffect, useState } from "react";
import { partnerManagersApi } from "../api/partnerManagersApi";
import type { PartnerManager, PartnerManagerInput } from "../types";

export function usePartnerManagers() {
  const [managers, setManagers] = useState<PartnerManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchManagers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await partnerManagersApi.list();
      if (res.data.success) setManagers(res.data.data);
    } catch (err) {
      console.error("Error loading partner managers:", err);
      setError("Failed to load partner managers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchManagers();
  }, [fetchManagers]);

  const createManager = useCallback(
    async (input: PartnerManagerInput) => {
      const res = await partnerManagersApi.create(input);
      if (res.data.success) await fetchManagers();
      return res.data;
    },
    [fetchManagers],
  );

  const updateManager = useCallback(
    async (managerId: string, input: PartnerManagerInput) => {
      const res = await partnerManagersApi.update(managerId, input);
      if (res.data.success) await fetchManagers();
      return res.data;
    },
    [fetchManagers],
  );

  return { managers, loading, error, fetchManagers, createManager, updateManager };
}
