import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  FiBarChart2,
  FiBriefcase,
  FiChevronUp,
  FiGift,
  FiGrid,
  FiKey,
  FiLogOut,
  FiUser,
  FiUserPlus,
  FiUsers,
} from "react-icons/fi";
import { useAuth } from "../../../common/auth/useAuth";
import { hrApi } from "../../../common/api/hrApi";
import { Initials } from "../components/ui";

interface NavLink {
  label: string;
  to: string;
  Icon: React.ElementType;
}

const navGroups: { title: string; links: NavLink[] }[] = [
  {
    title: "Team",
    links: [
      { label: "Overview", to: "/hr/dashboard", Icon: FiGrid },
      { label: "Employees", to: "/hr/employees", Icon: FiUsers },
      { label: "Add employees", to: "/hr/onboarding", Icon: FiUserPlus },
      { label: "Departments", to: "/hr/departments", Icon: FiBriefcase },
    ],
  },
  {
    title: "Engagement",
    links: [
      { label: "Rewards", to: "/hr/rewards", Icon: FiGift },
      { label: "Polls", to: "/hr/polls", Icon: FiBarChart2 },
    ],
  },
];

interface HrNavbarProps {
  closeSidebar?: () => void;
}

export default function HrNavbar({ closeSidebar }: HrNavbarProps) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [accountOpen, setAccountOpen] = useState(false);
  const [company, setCompany] = useState<{ company_name: string; company_logo: string | null } | null>(null);

  useEffect(() => {
    hrApi
      .get("/employees/company-profile")
      .then((response) => setCompany(response.data?.data || null))
      .catch((error) => console.error("Unable to load company branding:", error));
  }, []);

  const linkClass = (active: boolean) =>
    `group flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm transition ${
      active
        ? "bg-gradient-to-r from-[#852BAF] from-60% to-[#C13A8E] font-medium text-white shadow-md shadow-purple-200"
        : "text-slate-600 hover:bg-purple-50/70 hover:text-[#6E2391]"
    }`;

  const iconClass = (active: boolean) =>
    `flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
      active ? "bg-white/20 text-white" : "bg-purple-50 text-[#852BAF] group-hover:bg-white"
    }`;

  return (
    <nav className="flex h-full w-64 flex-col border-r border-purple-100 bg-gradient-to-b from-white via-white to-[#fbf7fd]">
      {/* Company */}
      <div className="flex h-16 items-center gap-3 border-b border-purple-100 px-4">
        {company?.company_logo ? (
          <img src={company.company_logo} alt="" className="h-9 w-9 rounded-xl border border-purple-100 bg-white object-contain p-0.5" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#852BAF] from-55% to-[#C13A8E] text-sm font-semibold text-white shadow-md shadow-purple-200">
            {(company?.company_name || "R").charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{company?.company_name || "Reward Planners"}</p>
          <p className="text-[11px] font-medium text-[#852BAF]">HR portal</p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {navGroups.map((group) => (
          <div key={group.title}>
            <p className="mb-1.5 px-2 text-[11px] font-medium text-slate-400">{group.title}</p>
            <div className="space-y-1">
              {group.links.map(({ label, to, Icon }) => {
                const active = pathname === to;
                return (
                  <Link key={to} to={to} onClick={closeSidebar} aria-current={active ? "page" : undefined} className={linkClass(active)}>
                    <span className={iconClass(active)}><Icon className="h-4 w-4" /></span>
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Account */}
      <div className="m-3 rounded-2xl border border-purple-100 bg-purple-50/50 p-2">
        {accountOpen && (
          <div className="mb-2 space-y-1 border-b border-purple-100 pb-2">
            <Link to="/hr/profile" onClick={closeSidebar} className={linkClass(pathname === "/hr/profile")}>
              <span className={iconClass(pathname === "/hr/profile")}><FiUser className="h-4 w-4" /></span> Profile
            </Link>
            <Link to="/hr/change-password" onClick={closeSidebar} className={linkClass(pathname === "/hr/change-password")}>
              <span className={iconClass(pathname === "/hr/change-password")}><FiKey className="h-4 w-4" /></span> Change password
            </Link>
            <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-sm text-red-600 transition-colors hover:bg-red-50 cursor-pointer">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50"><FiLogOut className="h-4 w-4" /></span> Sign out
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setAccountOpen((open) => !open)}
          aria-expanded={accountOpen}
          className="flex w-full items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left transition-colors hover:bg-white cursor-pointer"
        >
          <Initials name={user?.name || user?.email} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-800">{user?.name || user?.email}</span>
            {user?.name && <span className="block truncate text-[11px] text-slate-500">{user.email}</span>}
          </span>
          <FiChevronUp className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${accountOpen ? "" : "rotate-180"}`} />
        </button>
      </div>
    </nav>
  );
}
