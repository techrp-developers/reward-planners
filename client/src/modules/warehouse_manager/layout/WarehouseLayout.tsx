import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../../common/auth/useAuth";
import PremiumPortalShell from "../../../common/layouts/PremiumPortalShell";
import WarehouseSidebar from "./WarehouseSidebar";

export default function WarehouseLayout() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user || user.role !== "warehouse_manager") return <Navigate to="/login" replace />;

  return (
    <PremiumPortalShell sidebar={<WarehouseSidebar closeSidebar={() => undefined} />} roleLabel="Warehouse workspace" userLabel={user.name || user.email}>
      <Outlet />
    </PremiumPortalShell>
  );
}
