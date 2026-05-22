import { Navigate, Outlet } from "react-router-dom";
import AdminNavbar from "../components/sidebar/Admin";
import { useAuth } from "../auth/useAuth";

// AdminLayout.tsx
export default function AdminLayout() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user || user.role !== "admin") return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNavbar />

      {/* Match content width to viewport minus fixed sidebar width (w-64 = 16rem). */}
      <main className="ml-64 min-h-screen w-[calc(100%-16rem)] overflow-x-hidden">
        <div className="p-2 md:p-3">
          <Outlet />
        </div>
      </main>
    </div>
  );
}