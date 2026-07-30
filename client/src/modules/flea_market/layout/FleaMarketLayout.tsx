import { Navigate, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../../../common/auth/useAuth";
import FleaMarketSidebar from "./FleaMarketSidebar";
import { pingFleaMarketHealth } from "../api/fleaMarketClient";

export default function FleaMarketLayout() {
  const { user, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) {
      void pingFleaMarketHealth();
    }
  }, []);

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
      {/* min-w-0 overrides the flex default of min-width:auto, which lets a
          flex item refuse to shrink below its content's intrinsic width —
          without this, wide content two levels down (e.g. an un-wrapped
          button row) silently forces this whole column wider than the
          viewport regardless of the overflow-x-hidden below. */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center justify-between px-4 bg-white shadow-sm h-14 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-lg text-gray-700"
          >
            ☰
          </button>
          <h1 className="font-semibold text-gray-800">Flea Market Dashboard</h1>
        </header>

        {/* overflow-x-hidden so a wide table/element on any page scrolls
            within its own container, never the whole page — the sidebar is
            positioned relative to the viewport, not the document, so page-
            level horizontal scroll drags content underneath it. */}
        <main className="flex-1 min-w-0 p-4 overflow-y-auto overflow-x-hidden md:p-6 md:ml-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
