import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../../common/auth/useAuth";
import ServicePartnerNavbar from "./ServicePartnerSidebar";
import PremiumPortalShell from "../../../common/layouts/PremiumPortalShell";

export default function ServicePartnerLayout() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user || user.role !== "service_partner") {
    return <Navigate to="/login" replace />;
  }

  return <PremiumPortalShell sidebar={<ServicePartnerNavbar />} roleLabel="Service partner workspace" userLabel={user.name || user.email}><Outlet /></PremiumPortalShell>;
}
