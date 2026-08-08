import { Link, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  FiGrid,
  FiUsers,
  FiUserPlus,
  FiUser,
  FiLogOut,
  FiGift,
  FiChevronDown,
} from "react-icons/fi";
import { HiOutlineUserCircle } from "react-icons/hi2";
import { useAuth } from "../../../common/auth/useAuth";
import { hrApi } from "../../../common/api/hrApi";

/* ================= TYPES ================= */

type IconType = React.ElementType;

interface NavLink {
  type: "link";
  label: string;
  to: string;
  Icon: IconType;
  isDisabled?: boolean;
}

interface NavDropdown {
  type: "dropdown";
  label: string;
  Icon: IconType;
  children: NavLink[];
}

type NavItem = NavLink | NavDropdown;

interface HrNavbarProps {
  closeSidebar?: () => void;
}

/* ================= COMPONENT ================= */

export default function HrNavbar({ closeSidebar }: HrNavbarProps) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [company, setCompany] = useState<{
    company_name: string;
    company_logo: string | null;
  } | null>(null);

  useEffect(() => {
    hrApi
      .get("/employees/company-profile")
      .then((response) => setCompany(response.data?.data || null))
      .catch((error) => console.error("Unable to load company branding:", error))
      .finally(() => setLoading(false));
  }, []);

  const isActive = (path: string): boolean => pathname === path;


const navItems: NavItem[] = [
  {
    type: "link",
    label: "Dashboard",
    to: "/hr/dashboard",
    Icon: FiGrid,
  },
  {
    type: "link",
    label: "Onboarding",
    to: "/hr/onboarding",
    Icon: FiUserPlus,
  },
  {
    type: "link",
    label: "Employees List",
    to: "/hr/employees",
    Icon: FiUsers,
  },

  // ✅ NEW MENU
  {
    type: "link",
    label: "Manage Rewards",
    to: "/hr/rewards",
    Icon: FiGift,
  },
];

  if (loading) return null;

  return (
    <nav className="fixed top-0 left-0 flex flex-col w-64 h-full bg-white border-r border-gray-100 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      {/* Branding */}
      <div className="px-8 py-10">
        <div className="flex items-center gap-3">
          {company?.company_logo ? (
            <img
              src={company.company_logo}
              alt={`${company.company_name} logo`}
              className="object-contain w-10 h-10 p-1 bg-white border border-gray-100 rounded-lg shadow-sm"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#852BAF] to-[#FC3F78] shadow-lg flex items-center justify-center text-white font-black italic">
              R
            </div>
          )}
          <div>
            <h1 className="text-xl font-black text-gray-900">REWARDS</h1>
            <p className="text-[10px] uppercase font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#852BAF] to-[#FC3F78]">
              HR Portal
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          if (item.type === "dropdown") {
            return (
              <div key={item.label} className="space-y-1">
                <button
                  onClick={() =>
                    setOpenDropdown(
                      openDropdown === item.label ? null : item.label
                    )
                  }
                  className={`flex items-center justify-between w-full px-4 py-3 text-sm font-bold rounded-xl transition-all ${
                    openDropdown === item.label
                      ? "text-[#852BAF] bg-purple-50/50"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <item.Icon className="text-lg" />
                    {item.label}
                  </span>
                </button>
              </div>
            );
          }

          // LINK TYPE
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

      {/* ── PROFILE SECTION ── */}
      <div
        className="p-3 m-3 rounded-2xl"
        style={{
          background:
            "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.12)",
        }}
      >
        <button
          onClick={() => setIsProfileOpen((prev) => !prev)}
          className="flex items-center w-full gap-3 group cursor-pointer"
        >
          <div className="relative shrink-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-[15px] transition-transform duration-200 group-hover:scale-105"
              style={{
                background: "linear-gradient(135deg, #852BAF 0%, #FC3F78 100%)",
                boxShadow: "0 4px 12px rgba(133,43,175,0.3)",
              }}
            >
              {user?.email?.charAt(0).toUpperCase() || "M"}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
            </div>
          </div>

          <div className="flex-1 min-w-0 overflow-hidden text-left">
            <p className="text-[13px] font-semibold text-gray-900 truncate leading-tight">
              {user?.name || user?.email}
            </p>
            <p className="text-[10px] text-[#852BAF] font-bold uppercase tracking-wider mt-0.5">
              HR Admin
            </p>
          </div>

          <FiChevronDown
            className={`text-gray-400 shrink-0 transition-transform duration-300 ${
              isProfileOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        <div
          className={`overflow-hidden transition-all duration-300 ${
            isProfileOpen ? "max-h-28 mt-3 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div
            className="w-full h-px mb-2"
            style={{
              background:
                "linear-gradient(90deg, rgba(133,43,175,0.2), transparent)",
            }}
          />
          <div className="space-y-0.5">
            <Link
              to="/hr/profile"
              onClick={closeSidebar}
              className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-white/80 hover:text-[#852BAF] rounded-xl transition-all duration-150"
            >
              <FiUser className="text-base text-gray-400 shrink-0" />
              Profile
            </Link>

            <Link
              to="/hr/change-password"
              onClick={closeSidebar}
              className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-white/80 hover:text-[#852BAF] rounded-xl transition-all duration-150"
            >
              <HiOutlineUserCircle className="text-base text-gray-400 shrink-0" />
              Change Password
            </Link>

            <button
              onClick={logout}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all duration-150 cursor-pointer"
            >
              <FiLogOut className="text-base shrink-0" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
