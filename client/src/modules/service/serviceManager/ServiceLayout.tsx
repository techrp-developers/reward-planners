import { Navigate, Outlet } from "react-router-dom";
import ServiceNavbar from "./ServiceSidebar";
import { useAuth } from "../../../common/auth/useAuth";
import PremiumPortalShell from "../../../common/layouts/PremiumPortalShell";

export default function ServiceLayout() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user || user.role !== "service_manager") return <Navigate to="/login" replace />;

  return <PremiumPortalShell sidebar={<ServiceNavbar />} roleLabel="Service manager workspace" userLabel={user.name || user.email}><Outlet /></PremiumPortalShell>;
}
