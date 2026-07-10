import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../../common/auth/useAuth";
import ServicePartnerNavbar from "./ServicePartnerSidebar";

export default function ServicePartnerLayout() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user || user.role !== "service_partner") {
    return <Navigate to="/login" replace />;
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "linear-gradient(135deg, #F8F4FF 0%, #FFF5F8 50%, #F4F9FF 100%)",
      }}
    >
      <ServicePartnerNavbar />
      <main className="ml-64 min-h-screen">
        <div className="p-5 page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
