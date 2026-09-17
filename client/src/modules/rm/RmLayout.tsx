import { Navigate, Outlet } from "react-router-dom";
import RmSidebar from "./RmSidebar";
import { useAuth } from "../../common/auth/useAuth";
import PremiumPortalShell from "../../common/layouts/PremiumPortalShell";

export default function RmLayout() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user || user.role !== "rm") return <Navigate to="/login" replace />;

  return (
    <PremiumPortalShell sidebar={<RmSidebar />} roleLabel="RM workspace" userLabel={user.name || user.email}>
      <Outlet />
    </PremiumPortalShell>
  );
}
