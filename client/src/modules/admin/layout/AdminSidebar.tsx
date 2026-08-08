import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  FiGrid,
  FiUsers,
  FiPackage,
  FiChevronDown,
  FiChevronsRight,
  FiUser,
  FiLogOut,
} from "react-icons/fi";

import { useAuth } from "../../../common/auth/useAuth";
import { routes } from "../../../routes";

/* ================= TYPES ================= */

type NavChild = {
  label: string;
  to: string;
};

type NavItem = {
  label: string;
  to?: string;
  icon: React.ReactNode;
  type: "link" | "dropdown";
  children?: NavChild[];
};

/* ================= COMPONENT ================= */

export default function AdminNavbar() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  const [open, setOpen] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState<boolean>(false);

  const isActive = (to: string) => pathname === to;

  const navItems: NavItem[] = [
    {
      label: "Dashboard",
      to: routes.admin.dashboard,
      icon: <FiGrid />,
      type: "link",
    },
    {
      label: "Vendors",
      to: routes.admin.vendors,
      icon: <FiUsers />,
      type: "link",
    },
    {
      label: "Products",
      to: routes.admin.products,
      icon: <FiPackage />,
      type: "link",
    },
    {
      label: "Services",
      to: routes.admin.services,
      icon: <FiPackage />,
      type: "link",
    },

    // Example dropdown
    // {
    //   label: "Settings",
    //   icon: <FiUsers />,
    //   type: "dropdown",
    //   children: [
    //     {
    //       label: "Users",
    //       to: "/admin/users",
    //     },
    //     {
    //       label: "Roles",
    //       to: "/admin/roles",
    //     },
    //   ],
    // },
  ];

  return (
    <nav className="fixed top-0 left-0 flex flex-col w-64 h-full bg-white border-r border-gray-100 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      {/* Branding */}
      <div className="px-8 py-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#852BAF] to-[#FC3F78] shadow-lg flex items-center justify-center text-white font-black italic">
            R
          </div>

          <div>
            <h1 className="text-xl font-black text-gray-900">
              REWARDS
            </h1>

            <p className="text-[10px] uppercase font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#852BAF] to-[#FC3F78]">
              Admin Portal
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 px-4 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const isItemActive =
            item.type === "link" &&
            !!item.to &&
            isActive(item.to);

          const isDropdownOpen = open === item.label;

          if (item.type === "dropdown") {
            return (
              <div key={item.label} className="space-y-1">
                <button
                  onClick={() =>
                    setOpen(
                      isDropdownOpen ? null : item.label
                    )
                  }
                  className={`flex items-center justify-between w-full px-4 py-3 text-sm font-bold rounded-xl transition-all ${
                    isDropdownOpen
                      ? "text-[#852BAF] bg-purple-50/50"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <span className="text-lg">
                      {item.icon}
                    </span>

                    {item.label}
                  </span>

                  <FiChevronDown
                    className={`transition-transform ${
                      isDropdownOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isDropdownOpen && item.children && (
                  <div className="py-1 mx-2 space-y-1 border bg-gray-50/50 rounded-xl border-gray-100/50">
                    {item.children.map(
                      (child: NavChild) => (
                        <Link
                          key={child.to}
                          to={child.to}
                          className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-[13px] font-semibold transition-all ${
                            isActive(child.to)
                              ? "text-[#852BAF]"
                              : "text-gray-500 hover:text-[#FC3F78]"
                          }`}
                        >
                          <FiChevronsRight className="text-[10px]" />

                          {child.label}
                        </Link>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          }

          return (
            <Link
              key={item.to}
              to={item.to || "#"}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                isItemActive
                  ? "bg-gradient-to-r from-[#852BAF] to-[#FC3F78] text-white shadow-md"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <span className="text-lg">{item.icon}</span>

              {item.label}
            </Link>
          );
        })}
      </div>

      {/* Profile */}
      <div className="p-4 mt-auto border-t border-gray-100">
        <button
          onClick={() =>
            setProfileOpen((p) => !p)
          }
          className="flex items-center w-full gap-3 p-2 rounded-2xl hover:bg-gray-50"
        >
          <div className="w-10 h-10 flex items-center justify-center text-white font-black rounded-xl bg-gradient-to-tr from-[#852BAF] to-[#FC3F78]">
            {user?.email?.[0]?.toUpperCase() || "M"}
          </div>

          <div className="flex-1 text-left truncate">
            <p className="text-xs font-black text-gray-900 truncate">
              {user?.email?.split("@")[0] ||
                "Manager"}
            </p>

            <p className="text-[10px] text-gray-400 font-bold italic">
              View Profile
            </p>
          </div>
        </button>

        {profileOpen && (
          <div className="mt-2 overflow-hidden bg-white border border-gray-100 shadow-xl rounded-2xl">
            <Link
              to={routes.admin.profile}
              className="flex items-center gap-3 px-5 py-4 text-sm font-bold text-gray-600 hover:bg-gray-50"
            >
              <FiUser />
              Profile
            </Link>

            <Link
              to={routes.admin.changePassword}
              className="flex items-center gap-3 px-5 py-4 text-sm font-bold text-gray-600 hover:bg-gray-50"
            >
              <FiUser />
              Change Password
            </Link>

            <button
              onClick={logout}
              className="flex items-center w-full gap-3 px-5 py-4 text-sm font-bold text-red-500 cursor-pointer hover:bg-red-50"
            >
              <FiLogOut />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}