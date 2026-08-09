import { useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { FiMenu } from "react-icons/fi";
import { useAuth } from "../../../common/auth/useAuth";
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

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/85 px-4 backdrop-blur-xl lg:hidden">
        <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm">
          <FiMenu size={20} />
        </button>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-purple-600">Vendor workspace</p>
          <p className="max-w-52 truncate text-sm font-semibold text-slate-800">{user?.name || user?.email}</p>
        </div>
      </header>

      <main className="relative min-h-screen lg:ml-64">
        <div key={pathname} className="page-enter mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
