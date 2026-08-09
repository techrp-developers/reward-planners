import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  FiGrid,
  FiPackage,
  FiArrowDownCircle,
  FiArrowUpCircle,
  FiSliders,
  FiTruck,
  FiLogOut,
} from "react-icons/fi";
import { HiOutlineUserCircle } from "react-icons/hi2";
import { useAuth } from "../../../common/auth/useAuth";

/* ================= TYPES ================= */

interface NavLink {
  label: string;
  to: string;
  Icon: React.ElementType;
}

interface WarehouseSidebarProps {
  closeSidebar?: () => void;
}

/* ================= NAV ITEMS ================= */

const navItems: NavLink[] = [
  { label: "Dashboard", to: "/warehouse/dashboard", Icon: FiGrid },
  { label: "Stock Summary", to: "/warehouse/inventory", Icon: FiPackage },
  { label: "Stock In", to: "/warehouse/stock/stockin", Icon: FiArrowDownCircle },
  { label: "Stock Out", to: "/warehouse/stock/stockout", Icon: FiArrowUpCircle },
  { label: "Stock Adjustment", to: "/warehouse/stock/stockadjustment", Icon: FiSliders },
  { label: "Dispatch", to: "/warehouse/fulfilment/dispatch", Icon: FiTruck },
];

/* ================= COMPONENT ================= */

export default function WarehouseSidebar({ closeSidebar }: WarehouseSidebarProps) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [isProfileOpen, setIsProfileOpen] = useState(true);

  const isActive = (path: string) => pathname === path;

  return (
    <nav className="premium-role-sidebar fixed top-0 left-0 flex flex-col w-64 h-full bg-white border-r border-gray-100 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      {/* Branding */}
      <div className="px-8 py-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#852BAF] to-[#FC3F78] shadow-lg flex items-center justify-center text-white font-black italic">
            R
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900">REWARDS</h1>
            <p className="text-[10px] uppercase font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#852BAF] to-[#FC3F78]">
              Warehouse Portal
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
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

      {/* Profile */}
      <div className="p-4 mt-auto border-t border-gray-100">
        <button
          onClick={() => setIsProfileOpen((prev) => !prev)}
          className="flex items-center w-full gap-3 p-2 rounded-2xl hover:bg-gray-50"
        >
          <div className="w-10 h-10 flex items-center justify-center text-white font-black rounded-xl bg-gradient-to-tr from-[#852BAF] to-[#FC3F78]">
            {user?.email?.[0]?.toUpperCase() || "W"}
          </div>
          <div className="flex-1 text-left truncate">
            <p className="text-xs font-black text-gray-900 truncate">
              {user?.email?.split("@")[0] || "User"}
            </p>
            <p className="text-[10px] text-gray-400 truncate">Warehouse Manager</p>
          </div>
        </button>

        {isProfileOpen && (
          <div className="mt-2 space-y-1">
            <Link
              to="/warehouse/profile"
              onClick={closeSidebar}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded hover:bg-gray-100"
            >
              <HiOutlineUserCircle className="text-lg" />
              Profile
            </Link>

            <Link
              to="/warehouse/change-password"
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
