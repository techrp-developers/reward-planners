import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { FiTruck, FiShoppingCart, FiChevronsRight } from "react-icons/fi";
import { useAuth } from "../../auth/useAuth";

/* ================= SVG ICONS ================= */

type SvgProps = React.SVGProps<SVGSVGElement>;

const LayoutDashboard = (props: SvgProps) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <line x1="15" y1="3" x2="15" y2="21" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
  </svg>
);

const ChevronDown = (props: SvgProps) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const UserCircle = (props: SvgProps) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const Settings = (props: SvgProps) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const LogOut = (props: SvgProps) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" x2="9" y1="12" y2="12" />
  </svg>
);

/* ================= SUB MENU ================= */

interface SubMenuItemProps {
  to: string;
  label: string;
  active: boolean;
  brandPurple: string;
}

const SubMenuItem = ({ to, label, active, brandPurple }: SubMenuItemProps) => (
  <Link
    to={to}
    className={`flex items-center space-x-2 pl-12 pr-4 py-2 text-sm font-medium rounded-lg
      ${active ? "text-white font-bold" : "text-gray-600 hover:bg-gray-100"}
    `}
    style={active ? { backgroundColor: brandPurple } : undefined}
  >
    <FiChevronsRight className="w-4 h-4" />
    <span>{label}</span>
  </Link>
);

/* ================= NAV TYPES ================= */

interface NavLink {
  label: string;
  to: string;
  Icon: React.FC<SvgProps>;
  isDropdown?: false;
}

interface NavDropdown {
  label: string;
  Icon: React.FC<SvgProps>;
  isDropdown: true;
  children: { to: string; label: string }[];
}

type NavItem = NavLink | NavDropdown;

/* ================= COMPONENT ================= */

export default function WarehouseNavbar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  const brandPurple = "#852BAF";
  const brandPink = "#FC3F78";
  // const brandLightPurple = "#F3E8FF";

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const toggleDropdown = (label: string) =>
    setOpenDropdown((prev) => (prev === label ? null : label));

  const isActive = (path: string) => pathname === path;

  const navItems: NavItem[] = [
    {
      to: "/warehouse/dashboard",
      label: "Dashboard",
      Icon: LayoutDashboard,
    },
    {
      label: "Inventory",
      Icon: FiTruck,
      isDropdown: true,
      children: [
        { to: "/warehouse/inventory", label: "Stock Summary" },
        { to: "/warehouse/stock/stockin", label: "Stock In" },
        { to: "/warehouse/stock/stockout", label: "Stock Out" },
        { to: "/warehouse/stock/stockadjustment", label: "Stock Adjustment" },
      ],
    },
    {
      label: "Order Status",
      Icon: FiShoppingCart,
      isDropdown: true,
      children: [
        { to: "/warehouse/fulfilment/pending", label: "Pending" },
        { to: "/warehouse/fulfilment/dispatch", label: "Dispatch" },
        { to: "/warehouse/fulfilment/return", label: "Return" },
      ],
    },
  ];

  return (
    <nav className="fixed top-0 left-0 h-full w-60 bg-white border-r shadow flex flex-col">
      {/* LOGO */}
      <div className="p-6 border-b">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
            style={{ backgroundImage: `linear-gradient(45deg, ${brandPurple}, ${brandPink})` }}
          >
            W
          </div>
          <div>
            <h1 className="font-bold text-xl">Warehouse</h1>
            <p className="text-xs text-gray-400">Management Portal</p>
          </div>
        </div>
      </div>

      {/* MENU */}
      <div className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) =>
          item.isDropdown ? (
            <div key={item.label}>
              <button
                onClick={() => toggleDropdown(item.label)}
                className="w-full flex justify-between px-4 py-3 rounded-xl font-semibold text-gray-700 hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <item.Icon />
                  <span>{item.label}</span>
                </div>
                <ChevronDown className={openDropdown === item.label ? "rotate-180" : ""} />
              </button>

              {openDropdown === item.label && (
                <div className="mt-1">
                  {item.children.map((c) => (
                    <SubMenuItem
                      key={c.to}
                      to={c.to}
                      label={c.label}
                      active={isActive(c.to)}
                      brandPurple={brandPurple}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-semibold
                ${isActive(item.to) ? "bg-purple-100 text-purple-700" : "text-gray-600 hover:bg-gray-50"}
              `}
            >
              <item.Icon />
              <span>{item.label}</span>
            </Link>
          )
        )}
      </div>

      {/* PROFILE */}
      <div className="p-4 border-t">
        <button
          onClick={() => setIsProfileOpen((p) => !p)}
          className="w-full flex items-center gap-3"
        >
          <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center font-bold text-purple-700">
            {user?.email?.charAt(0).toUpperCase() || "W"}
          </div>
          <div className="text-left">
            <p className="text-sm font-bold">{user?.email}</p>
            <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
          </div>
          <ChevronDown className={isProfileOpen ? "rotate-180" : ""} />
        </button>

        {isProfileOpen && (
          <div className="mt-2 bg-white border rounded-xl shadow">
            <Link to="/warehouse/profile" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50">
              <UserCircle /> Profile
            </Link>

            <Link to="/warehouse/settings" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-gray-50">
              <Settings /> Settings
            </Link>

            <button
              onClick={logout}
              className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut /> Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
