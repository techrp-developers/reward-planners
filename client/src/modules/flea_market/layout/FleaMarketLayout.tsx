import { useEffect } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../../common/auth/useAuth";
import PremiumPortalShell from "../../../common/layouts/PremiumPortalShell";
import { pingFleaMarketHealth } from "../api/fleaMarketClient";
import FleaMarketSidebar from "./FleaMarketSidebar";

export default function FleaMarketLayout() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (import.meta.env.DEV) void pingFleaMarketHealth();
  }, []);

  if (loading) return null;
  if (!user || user.role !== "flea_market_manager") return <Navigate to="/login" replace />;

  return (
    <PremiumPortalShell sidebar={<FleaMarketSidebar closeSidebar={() => undefined} />} roleLabel="Flea Market workspace" userLabel={user.name || user.email}>
      <Outlet />
    </PremiumPortalShell>
  );
}
