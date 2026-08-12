import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import {
  FiChevronDown,
  FiLogOut,
  FiLayout,
  FiUser,
  FiBriefcase,
  FiCreditCard,
  FiCalendar,
  FiStar,
  FiFileText,
  FiSettings,
  FiLock,
} from "react-icons/fi";
import { useAuth } from "../../../common/auth/useAuth";
import { routes } from "../../../routes";
import logo from "../../../common/assets/logo.svg";

interface NavLink {
  label: string;
  to: string;
  Icon: React.ElementType;
}

export default function ServicePartnerNavbar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [isProfileOpen, setIsProfileOpen] = useState(true);

  const isActive = (path: string) => pathname === path;

  const navItems: NavLink[] = [
    { label: "Dashboard", to: routes.servicePartner.dashboard, Icon: FiLayout },
    { label: "My Profile", to: routes.servicePartner.profile, Icon: FiUser },
    { label: "My Services", to: routes.servicePartner.services.list, Icon: FiBriefcase },
    { label: "Rate Card", to: routes.servicePartner.rateCard, Icon: FiCreditCard },
    { label: "Bookings", to: routes.servicePartner.bookings.list, Icon: FiCalendar },
    { label: "Reviews", to: routes.servicePartner.reviews, Icon: FiStar },
    { label: "Documents", to: routes.servicePartner.documents, Icon: FiFileText },
    { label: "Settings", to: routes.servicePartner.settings, Icon: FiSettings },
  ];

  return (
    <nav
      className="premium-role-sidebar fixed top-0 left-0 flex flex-col w-64 h-full font-sans"
      style={{
        background: "linear-gradient(180deg, #ffffff 0%, #fdf8ff 60%, #fff5f8 100%)",
        borderRight: "1px solid rgba(133,43,175,0.1)",
        boxShadow: "4px 0 32px rgba(133,43,175,0.08)",
        animation: "slideInLeft 0.35s cubic-bezier(.22,.68,0,1.2) both",
      }}
    >
      {/* ── BRAND LOGO ── */}
      <div className="px-6 pb-5 pt-7">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center overflow-hidden h-11 w-11 rounded-2xl logo-glow-pulse"
            style={{
              background: "linear-gradient(135deg, #ffffff 0%, #fff5f8 100%)",
              boxShadow: "0 6px 20px rgba(133,43,175,0.35)",
            }}
          >
            <img src={logo} alt="Rewards Logo" className="object-contain w-7 h-7" />
          </div>

          <div>
            <h1 className="text-[17px] font-extrabold text-gray-900 leading-none tracking-tight">
              Reward Planners
            </h1>
            <p className="text-[9px] uppercase tracking-[0.18em] font-bold mt-1.5 gradient-text-brand">
              Service Partner Portal
            </p>
          </div>
        </div>

        <div
          className="w-full h-px mt-5 rounded-full"
          style={{
            background: "linear-gradient(90deg, rgba(133,43,175,0.25) 0%, rgba(252,63,120,0.15) 60%, transparent 100%)",
          }}
        />
      </div>

      {/* ── NAVIGATION ── */}
      <div className="flex-1 px-3 space-y-0.5 overflow-y-auto vendor-sidebar-scroll pb-2">
        {navItems.map((item, i) => {
          const isLinkActive = isActive(item.to);

          return (
            <div
              key={item.label}
              className="outline-none"
              style={{ animation: `slideInLeft 0.3s ease both`, animationDelay: `${i * 55}ms` }}
            >
              <Link
                to={item.to}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                  isLinkActive
                    ? "text-white sidebar-link-active"
                    : "text-gray-500 hover:bg-purple-50/50 hover:text-[#852BAF]"
                }`}
                style={
                  isLinkActive
                    ? { background: "linear-gradient(135deg, #852BAF 0%, #C64EFE 100%)" }
                    : {}
                }
              >
                <item.Icon
                  className={`text-lg transition-colors ${
                    isLinkActive ? "text-white" : "text-gray-400 group-hover:text-[#852BAF]"
                  }`}
                />
                <span className="text-sm font-semibold">{item.label}</span>
              </Link>
            </div>
          );
        })}
      </div>

      {/* ── PROFILE SECTION ── */}
      <div
        className="p-3 m-3 rounded-2xl"
        style={{
          background: "linear-gradient(135deg, rgba(133,43,175,0.06) 0%, rgba(252,63,120,0.04) 100%)",
          border: "1px solid rgba(133,43,175,0.12)",
        }}
      >
        <button
          onClick={() => setIsProfileOpen((p) => !p)}
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
              {user?.email?.charAt(0).toUpperCase() || "P"}
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
              {user?.role}
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
            isProfileOpen ? "max-h-44 mt-3 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div
            className="w-full h-px mb-2"
            style={{ background: "linear-gradient(90deg, rgba(133,43,175,0.2), transparent)" }}
          />
          <div className="space-y-0.5">
            <Link
              to={routes.servicePartner.changePassword}
              className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-white/80 hover:text-[#852BAF] rounded-xl transition-all duration-150"
            >
              <FiLock className="text-base text-gray-400 shrink-0" />
              Change Password
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all duration-150 cursor-pointer"
            >
              <FiLogOut className="text-base shrink-0" /> Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
