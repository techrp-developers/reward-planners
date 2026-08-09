import { useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../../common/auth/useAuth";
import PortalTopNavbar from "../../../common/layouts/PortalTopNavbar";
import VendorNavbar from "./VendorSidebar";

export default function VendorLayout() {
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();

  if (loading) return null;

  if (!user || user.role !== "vendor") {
    return <Navigate to="/login" replace />;
  }

  return (
    <div
      className="vendor-portal min-h-screen bg-[#f7f6fa] text-slate-900"
      style={{
        background:
          "linear-gradient(135deg, #F8F4FF 0%, #FFF5F8 50%, #F4F9FF 100%)",
      }}
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_4%,rgba(133,43,175,0.08),transparent_28%),radial-gradient(circle_at_92%_92%,rgba(252,63,120,0.07),transparent_30%)]" />

      <VendorNavbar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {sidebarOpen && (
        <button
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm lg:hidden"
        />
      )}

      <PortalTopNavbar roleLabel="Vendor workspace" userLabel={user?.name || user?.email} onOpenSidebar={() => setSidebarOpen(true)} />

      <main className="relative min-h-screen lg:ml-64">
        <div key={pathname} className="page-enter mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
