import { Navigate, Outlet } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../../../common/auth/useAuth";
import FleaMarketSidebar from "./FleaMarketSidebar";

export default function FleaMarketLayout() {
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Loading...
      </div>
    );
  }

  if (!user || user.role !== "flea_market_manager") {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <div
        className={`
          fixed z-40 inset-y-0 left-0 w-64 bg-white shadow-md transform
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          transition-transform duration-300 ease-in-out
          md:translate-x-0 md:static md:shadow-none
        `}
      >
        <FleaMarketSidebar closeSidebar={() => setSidebarOpen(false)} />
      </div>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex flex-col flex-1">
        <header className="flex items-center justify-between px-4 bg-white shadow-sm h-14 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-lg text-gray-700"
          >
            ☰
          </button>
          <h1 className="font-semibold text-gray-800">Flea Market Dashboard</h1>
        </header>

        <main className="flex-1 p-4 overflow-y-auto md:p-6 md:ml-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
