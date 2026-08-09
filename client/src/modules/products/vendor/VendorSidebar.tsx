import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  FiTag,
  FiChevronDown,
  FiLogOut,
  FiLayout,
  FiPackage,
  FiBox,
  FiPlusSquare,
  FiBriefcase,
  FiChevronRight,
  FiShoppingCart,
  FiLock,
  FiShield,
  FiClock,
  FiUser,
  FiX,
  FiBarChart2,
} from "react-icons/fi";
import { api } from "../../../common/api/api";
import { useAuth } from "../../../common/auth/useAuth";
import logo from "../../../common/assets/logo.svg";

/* ================= TYPES ================= */
interface NavLink {
  label: string;
  to: string;
  Icon: React.ElementType;
  isDisabled?: boolean;
}

interface NavDropdown {
  label: string;
  Icon: React.ElementType;
  children: NavLink[];
}

type NavItem = NavLink | NavDropdown;

type VendorNavbarProps = {
  isOpen?: boolean;
  onClose?: () => void;
};

export default function VendorNavbar({ isOpen = false, onClose }: VendorNavbarProps) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [vendorStatus, setVendorStatus] = useState<"approved" | "pending" | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await api.get("/vendor/my-details");
        setVendorStatus(res.data.vendor.status);
      } catch {
        setVendorStatus(null);
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, []);

  const isApproved = vendorStatus === "approved";
  const isActive = (path: string) => pathname === path;

  const navItems: NavItem[] = [
    { label: "Dashboard", to: "/vendor/dashboard", Icon: FiLayout },
    !isApproved && { label: "Onboarding", to: "/vendor/onboarding", Icon: FiBriefcase },
    isApproved && {
      label: "Products",
      Icon: FiTag,
      children: [
        { label: "Add Product", to: "/vendor/products/add", Icon: FiPlusSquare },
        { label: "Product List", to: "/vendor/products/list", Icon: FiPackage },
      ],
    },
    isApproved && {
      label: "Orders",
      to: "/vendor/orders/summary",
      Icon: FiShoppingCart,
    },
    isApproved && {
      label: "Reports",
      Icon: FiBarChart2,
      children: [
        { label: "Stock Report", to: "/vendor/reports/stock", Icon: FiBox },
        { label: "Product Report", to: "/vendor/reports/products", Icon: FiPackage },
        { label: "Order Report", to: "/vendor/reports/orders", Icon: FiShoppingCart },
      ],
    },
  ].filter(Boolean) as NavItem[];

  if (loading) return null;

  return (
    <nav
      className={`premium-role-sidebar fixed left-0 top-0 z-50 flex h-full w-64 flex-col font-sans transition-transform duration-300 lg:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      style={{
        background: "linear-gradient(180deg, #ffffff 0%, #fdf8ff 60%, #fff5f8 100%)",
        borderRight: "1px solid rgba(133,43,175,0.1)",
        boxShadow: "4px 0 32px rgba(133,43,175,0.08)",
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
              Vendor Portal
            </p>
          </div>
          <button onClick={onClose} aria-label="Close navigation" className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden">
            <FiX size={18} />
          </button>
        </div>

        <div
          className="w-full h-px mt-5 rounded-full"
          style={{
            background: "linear-gradient(90deg, rgba(133,43,175,0.25) 0%, rgba(252,63,120,0.15) 60%, transparent 100%)",
          }}
        />
      </div>

      {/* ── VENDOR STATUS STRIP ── */}
      <div className="px-4 mb-2">
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
            isApproved
              ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
              : "border border-amber-100"
          }`}
          style={
            !isApproved
              ? { background: "rgba(251,191,36,0.08)", color: "#b45309" }
              : {}
          }
        >
          {isApproved ? (
            <>
              <FiShield className="shrink-0" size={13} />
              <span>Verified Partner</span>
              <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </>
          ) : (
            <>
              <FiClock className="shrink-0" size={13} />
              <span>Pending Approval</span>
              <div className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            </>
          )}
        </div>
      </div>

      {/* ── NAVIGATION ── */}
      <div className="flex-1 px-3 space-y-0.5 overflow-y-auto vendor-sidebar-scroll pb-2">
        {navItems.map((item, i) => {
          const hasChildren = "children" in item;
          const isLinkActive = !hasChildren && isActive(item.to);

          return (
            <div
              key={item.label}
              className="outline-none"
              style={{ animation: `slideInLeft 0.3s ease both`, animationDelay: `${i * 55}ms` }}
            >
              {hasChildren ? (
                <>
                  <button
                    onClick={() =>
                      setOpenDropdown(openDropdown === item.label ? null : item.label)
                    }
                    className={`flex items-center justify-between w-full gap-3 px-4 py-3 rounded-xl transition-all duration-200 group cursor-pointer ${
                      openDropdown === item.label
                        ? "bg-purple-50/70"
                        : "hover:bg-purple-50/40 text-gray-500"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <item.Icon
                        className={`text-lg transition-colors ${
                          openDropdown === item.label
                            ? "text-[#852BAF]"
                            : "text-gray-400 group-hover:text-[#852BAF]"
                        }`}
                      />
                      <span
                        className={`text-sm font-semibold ${
                          openDropdown === item.label ? "text-gray-900" : "text-gray-600"
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                    <FiChevronDown
                      className={`transition-transform duration-300 ${
                        openDropdown === item.label ? "rotate-180 text-[#852BAF]" : "text-gray-400"
                      }`}
                    />
                  </button>

                  <div
                    className={`overflow-hidden transition-all duration-300 ease-in-out ${
                      openDropdown === item.label
                        ? "max-h-52 opacity-100 mt-1"
                        : "max-h-0 opacity-0"
                    }`}
                  >
                    <div
                      className="ml-9 space-y-0.5"
                      style={{ borderLeft: "2px solid rgba(133,43,175,0.15)" }}
                    >
                      {item.children.map((child) => (
                        <Link
                          key={child.to}
                          to={child.to}
                          onClick={onClose}
                          className={`flex items-center gap-2 py-2.5 px-4 text-sm transition-all duration-200 rounded-r-xl border-l-2 -ml-0.5 ${
                            isActive(child.to)
                              ? "border-[#852BAF] text-[#852BAF] font-semibold bg-purple-50/60"
                              : "border-transparent text-gray-500 hover:text-[#852BAF] hover:bg-purple-50/60"
                          }`}
                        >
                          <FiChevronRight
                            className={`text-xs transition-all duration-200 ${
                              isActive(child.to)
                                ? "text-[#852BAF] translate-x-1"
                                : "text-gray-300"
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
                  to={item.to}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                    item.isDisabled
                      ? "bg-emerald-50 text-emerald-700 cursor-default opacity-90 border border-emerald-100"
                      : isLinkActive
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
                      item.isDisabled
                        ? "text-emerald-600"
                        : isLinkActive
                          ? "text-white"
                          : "text-gray-400 group-hover:text-[#852BAF]"
                    }`}
                  />
                  <span className="text-sm font-semibold">{item.label}</span>
                  {item.isDisabled && (
                    <span className="ml-auto text-[9px] font-bold tracking-widest uppercase text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-md">
                      Active
                    </span>
                  )}
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
              {user?.email?.charAt(0).toUpperCase() || "V"}
            </div>
            {/* Pulsing online dot */}
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

        {/* PROFILE DROPDOWN */}
        <div
          className={`overflow-hidden transition-all duration-300 ${
            isProfileOpen ? "max-h-44 mt-3 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div
            className="w-full h-px mb-2"
            style={{
              background: "linear-gradient(90deg, rgba(133,43,175,0.2), transparent)",
            }}
          />
          <div className="space-y-0.5">
            <Link
              to="/vendor/profile"
              onClick={onClose}
              className="flex items-center gap-2.5 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-white/80 hover:text-[#852BAF] rounded-xl transition-all duration-150"
            >
              <FiUser className="text-base text-gray-400 shrink-0" />
              Profile
            </Link>
            <Link
              to="/vendor/change-password"
              onClick={onClose}
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
