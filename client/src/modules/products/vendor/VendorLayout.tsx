import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../../common/auth/useAuth";
import PremiumPortalShell from "../../../common/layouts/PremiumPortalShell";
import VendorNavbar from "./VendorSidebar";
import "../../../common/layouts/plainPortal.css";

export default function VendorLayout() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user || user.role !== "vendor") {
    return <Navigate to="/login" replace />;
  }

  return (
    <PremiumPortalShell variant="plain" themeKey="vendor-theme" sidebar={<VendorNavbar />} roleLabel="Vendor Portal" userLabel={user.name || user.email}>
      <div className="plain-portal mx-auto max-w-7xl"><Outlet /></div>
    </PremiumPortalShell>
  );
}
