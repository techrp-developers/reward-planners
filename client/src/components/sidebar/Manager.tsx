import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  FiGrid,
  FiUsers,
  FiPackage,
  FiTag,
  FiChevronDown,
  FiChevronRight,
  FiLogOut,
  FiSliders,
  FiShoppingCart,
  FiGift,
  FiLock,
} from "react-icons/fi";
import { FaFileAlt, FaBolt } from "react-icons/fa";
import { useAuth } from "../../auth/useAuth";
import { routes } from "../../routes";
import logo from "../../assets/logo.svg";

interface NavChild {
  label: string;
  to: string;
}

interface NavItem {
  label: string;
  to?: string;
  Icon: React.ElementType;
  type: "link" | "dropdown";
  children?: NavChild[];
}

export default function ManagerNavbar() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const isActive = (to: string) => pathname === to;

  const navItems: NavItem[] = [
    { label: "Dashboard", to: routes.manager.dashboard, Icon: FiGrid, type: "link" },
    { label: "Vendors", to: routes.manager.vendors, Icon: FiUsers, type: "link" },
    { label: "Products", to: routes.manager.products, Icon: FiPackage, type: "link" },
    {
      label: "Category",
      Icon: FiTag,
      type: "dropdown",
      children: [
        { label: "Categories", to: routes.manager.categories },
        { label: "Subcategories", to: routes.manager.subcategories },
        { label: "Type / Sub-type", to: routes.manager.subsubcategories },
      ],
    },
    {
      label: "Document",
      Icon: FaFileAlt,
      type: "dropdown",
      children: [
        { label: "Add Document", to: routes.manager.addDocument },
        { label: "Category Link Document", to: routes.manager.linkDocument },
      ],
    },
    { label: "Category Attributes", to: routes.manager.attributes, Icon: FiSliders, type: "link" },
    {
      label: "Flash Sales",
      Icon: FaBolt,
      type: "dropdown",
      children: [
        { label: "Flash Sale List", to: routes.manager.flashlist },
        { label: "Flash Sale Create", to: routes.manager.flashCreate },
      ],
    },
    {
      label: "Orders",
      Icon: FiShoppingCart,
      type: "dropdown",
      children: [
        { label: "Order List", to: routes.manager.orders.orderList },
        { label: "Cancellation Request", to: routes.manager.orders.cancellationRequest },
      ],
    },
    {
      label: "Rewards",
      Icon: FiGift,
      type: "dropdown",
      children: [
        { label: "Reward Rule", to: routes.manager.rewards.rewardRule },
        { label: "Reward Mapping", to: routes.manager.rewards.mapping },
      ],
    },
  ];

  return (
    <nav
      className="fixed top-0 left-0 flex flex-col w-64 h-full font-sans"
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
              Manager Portal
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

      {/* ── MANAGER BADGE ── */}
      <div className="px-4 mb-2">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-purple-50 text-purple-700 border border-purple-100"
        >
          <FiGrid className="shrink-0" size={13} />
          <span>Manager Console</span>
          <div className="ml-auto w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
        </div>
      </div>

      {/* ── NAVIGATION ── */}
      <div className="flex-1 px-3 space-y-0.5 overflow-y-auto vendor-sidebar-scroll pb-2">
        {navItems.map((item, i) => {
          const isDropdownOpen = openDropdown === item.label;
          const isItemActive = item.type === "link" && !!item.to && isActive(item.to);

          return (
            <div
              key={item.label}
              className="outline-none"
              style={{ animation: "slideInLeft 0.3s ease both", animationDelay: `${i * 45}ms` }}
            >
              {item.type === "dropdown" ? (
                <>
                  <button
                    onClick={() => setOpenDropdown(isDropdownOpen ? null : item.label)}
                    className={`flex items-center justify-between w-full gap-3 px-4 py-3 rounded-xl transition-all duration-200 group cursor-pointer ${
                      isDropdownOpen
                        ? "bg-purple-50/70"
                        : "hover:bg-purple-50/40 text-gray-500"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.Icon
                        className={`text-lg transition-colors ${
                          isDropdownOpen ? "text-[#852BAF]" : "text-gray-400 group-hover:text-[#852BAF]"
                        }`}
                      />
                      <span
                        className={`text-sm font-semibold ${
                          isDropdownOpen ? "text-gray-900" : "text-gray-600"
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                    <FiChevronDown
                      className={`transition-transform duration-300 ${
                        isDropdownOpen ? "rotate-180 text-[#852BAF]" : "text-gray-400"
                      }`}
                    />
                  </button>

                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      isDropdownOpen ? "max-h-52 opacity-100 mt-1" : "max-h-0 opacity-0"
                    }`}
                  >
                    <div
                      className="ml-9 space-y-0.5"
                      style={{ borderLeft: "2px solid rgba(133,43,175,0.15)" }}
                    >
                      {item.children?.map((child) => (
                        <Link
                          key={child.to}
                          to={child.to}
                          className={`flex items-center gap-2 py-2.5 px-4 text-sm transition-all duration-200 rounded-r-xl border-l-2 -ml-0.5 ${
                            isActive(child.to)
                              ? "border-[#852BAF] text-[#852BAF] font-semibold bg-purple-50/60"
                              : "border-transparent text-gray-500 hover:text-[#852BAF] hover:bg-purple-50/60"
                          }`}
                        >
                          <FiChevronRight
                            className={`text-xs transition-all duration-200 ${
                              isActive(child.to) ? "text-[#852BAF] translate-x-1" : "text-gray-300"
                            }`}
                          />
                          <span>{child.label}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <Link
                  to={item.to!}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                    isItemActive
                      ? "text-white sidebar-link-active"
                      : "text-gray-500 hover:bg-purple-50/50 hover:text-[#852BAF]"
                  }`}
                  style={
                    isItemActive
                      ? { background: "linear-gradient(135deg, #852BAF 0%, #C64EFE 100%)" }
                      : {}
                  }
                >
                  <item.Icon
                    className={`text-lg transition-colors ${
                      isItemActive ? "text-white" : "text-gray-400 group-hover:text-[#852BAF]"
                    }`}
                  />
                  <span className="text-sm font-semibold">{item.label}</span>
                </Link>
              )}
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
            isProfileOpen ? "max-h-28 mt-3 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div
            className="w-full h-px mb-2"
            style={{ background: "linear-gradient(90deg, rgba(133,43,175,0.2), transparent)" }}
          />
          <div className="space-y-0.5">
            <Link
              to="/manager/change-password"
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
