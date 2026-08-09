import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  FiCalendar,
  FiGrid,
  FiUserCheck,
  FiLogOut,
  FiBarChart2,
  FiClock,
  FiBox,
  FiList,
} from "react-icons/fi";
import { HiOutlineUserCircle } from "react-icons/hi2";
import { useAuth } from "../../../common/auth/useAuth";
import { routes } from "../../../routes";

/* ================= TYPES ================= */

interface NavLink {
  label: string;
  to: string;
  Icon: React.ElementType;
}

interface NavSection {
  label?: string;
  items: NavLink[];
}

interface FleaMarketSidebarProps {
  closeSidebar?: () => void;
}

/* ================= NAV ITEMS ================= */

const navSections: NavSection[] = [
  {
    items: [
      { label: "Dashboard", to: routes.fleaMarket.dashboard, Icon: FiGrid },
      { label: "Manage Event", to: routes.fleaMarket.manageEvent, Icon: FiCalendar },
      { label: "Billing", to: routes.fleaMarket.billing.page, Icon: FiUserCheck },
      { label: "Add Stock", to: routes.fleaMarket.stock, Icon: FiBox },
      { label: "All Products", to: routes.fleaMarket.allProducts, Icon: FiList },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "Vendor Sales Report", to: routes.fleaMarket.reports.vendorSales, Icon: FiBarChart2 },
      { label: "Purchase History", to: routes.fleaMarket.reports.purchaseHistory, Icon: FiClock },
    ],
  },
];

/* ================= COMPONENT ================= */

export default function FleaMarketSidebar({ closeSidebar }: FleaMarketSidebarProps) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [isProfileOpen, setIsProfileOpen] = useState(true);

  const isActive = (path: string) => pathname === path;

  return (
    // No fixed/static positioning here — the wrapper in FleaMarketLayout.tsx
    // already handles that across breakpoints (fixed overlay on mobile,
    // static flex item on desktop). This nav being independently fixed too
    // caused it to stay pinned to the viewport even when the page scrolled
    // horizontally (e.g. from a wide table), visually overlapping content
    // that had shifted left underneath it.
    <nav className="premium-role-sidebar flex flex-col w-64 h-full bg-white border-r border-gray-100 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      {/* Branding */}
      <div className="px-8 py-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#852BAF] to-[#FC3F78] shadow-lg flex items-center justify-center text-white font-black italic">
            R
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900">REWARDS</h1>
            <p className="text-[10px] uppercase font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#852BAF] to-[#FC3F78]">
              Flea Market Portal
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-4 space-y-1.5 overflow-y-auto">
        {navSections.map((section, index) => (
          <div key={section.label ?? index} className={section.label ? "pt-4" : ""}>
            {section.label && (
              <p className="px-4 pb-2 text-[10px] font-black tracking-wider text-gray-400 uppercase">
                {section.label}
              </p>
            )}
            <div className="space-y-1.5">
              {section.items.map((item) => {
                const isItemActive = isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={closeSidebar}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                      isItemActive
                        ? "bg-gradient-to-r from-[#852BAF] to-[#FC3F78] text-white shadow-md"
                        : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                  >
                    <item.Icon className="text-lg" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Profile */}
      <div className="p-4 mt-auto border-t border-gray-100">
        <button
          onClick={() => setIsProfileOpen((prev) => !prev)}
          className="flex items-center w-full gap-3 p-2 rounded-2xl hover:bg-gray-50"
        >
          <div className="w-10 h-10 flex items-center justify-center text-white font-black rounded-xl bg-gradient-to-tr from-[#852BAF] to-[#FC3F78]">
            {user?.email?.[0]?.toUpperCase() || "F"}
          </div>
          <div className="flex-1 text-left truncate">
            <p className="text-xs font-black text-gray-900 truncate">
              {user?.email?.split("@")[0] || "User"}
            </p>
            <p className="text-[10px] text-gray-400 truncate">Flea Market Manager</p>
          </div>
        </button>

        {isProfileOpen && (
          <div className="mt-2 space-y-1">
            <Link
              to={routes.fleaMarket.profile}
              onClick={closeSidebar}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-gray-100"
            >
              <HiOutlineUserCircle className="text-lg" />
              Profile
            </Link>

            <Link
              to={routes.fleaMarket.changePassword}
              onClick={closeSidebar}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-gray-100"
            >
              <HiOutlineUserCircle className="text-lg" />
              Change Password
            </Link>

            <button
              onClick={logout}
              className="flex items-center w-full gap-2 px-3 py-2 text-sm text-red-500 rounded hover:bg-red-50"
            >
              <FiLogOut className="text-lg" />
              Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
