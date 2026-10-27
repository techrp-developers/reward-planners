import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../../common/auth/useAuth";
import PremiumPortalShell from "../../../common/layouts/PremiumPortalShell";
import HrNavbar from "./HrSidebar";

export default function HrLayout() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user || user.role !== "hr") return <Navigate to="/login" replace />;

  return (
    <PremiumPortalShell variant="plain" sidebar={<HrNavbar closeSidebar={() => undefined} />} roleLabel="HR portal" userLabel={user.name || user.email}>
      <div className="mx-auto max-w-7xl">
        <Outlet />
      </div>
    </PremiumPortalShell>
  );
}
