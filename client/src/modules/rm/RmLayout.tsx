import { Navigate, Outlet } from "react-router-dom";
import RmSidebar from "./RmSidebar";
import { useAuth } from "../../common/auth/useAuth";
import PremiumPortalShell from "../../common/layouts/PremiumPortalShell";
import "./rm.css";

export default function RmLayout() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user || user.role !== "rm") return <Navigate to="/login" replace />;
  return <PremiumPortalShell variant="plain" themeKey="rm-theme" sidebar={<RmSidebar />} roleLabel="RM Portal" userLabel={user.name || user.email}>
    <div className="rm-portal mx-auto max-w-7xl"><Outlet /></div>
  </PremiumPortalShell>;
}
