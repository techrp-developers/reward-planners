import { Navigate, Outlet } from "react-router-dom";
import ManagerNavbar from "../components/sidebar/Manager";
import { useAuth } from "../auth/useAuth";

export default function ManagerLayout() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user || user.role !== "vendor_manager") return <Navigate to="/login" replace />;

  return (
    <div
      className="flex min-h-screen"
      style={{ background: "linear-gradient(160deg, #fdf8ff 0%, #fff5f8 50%, #f8f9ff 100%)" }}
    >
      <ManagerNavbar />
      <main className="flex-1 min-w-0 ml-64 overflow-hidden">
        <div className="p-4 md:p-8 page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
