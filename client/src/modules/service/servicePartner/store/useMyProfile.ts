import { useCallback, useEffect, useState } from "react";
import { profileApi } from "../api/profileApi";
import type { PartnerProfile } from "../types";

export function useMyProfile() {
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    const res = await profileApi.get();
    if (res.data.success) setProfile(res.data.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateProfile = useCallback(async (input: PartnerProfile) => {
    const res = await profileApi.update(input);
    if (res.data.success) setProfile(res.data.data);
    return res.data;
  }, []);

  return { profile, loading, fetchProfile, updateProfile };
}
