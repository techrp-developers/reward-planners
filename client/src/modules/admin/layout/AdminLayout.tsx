import { Navigate, Outlet } from "react-router-dom";
import AdminNavbar from "./AdminSidebar";
import { useAuth } from "../../../common/auth/useAuth";
import PremiumPortalShell from "../../../common/layouts/PremiumPortalShell";

// AdminLayout.tsx
export default function AdminLayout() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user || user.role !== "admin") return <Navigate to="/login" replace />;

  return <PremiumPortalShell sidebar={<AdminNavbar />} roleLabel="Admin workspace" userLabel={user.name || user.email}><Outlet /></PremiumPortalShell>;
}
