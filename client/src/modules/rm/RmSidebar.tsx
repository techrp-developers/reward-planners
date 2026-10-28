import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FiGrid, FiUsers, FiBriefcase, FiHelpCircle, FiBarChart2, FiUser, FiKey, FiLogOut, FiChevronUp } from "react-icons/fi";
import { useAuth } from "../../common/auth/useAuth";
import { routes } from "../../routes";
import logo from "../../common/assets/logo.svg";

const groups = [
  { title: "Workspace", links: [
    { label: "Overview", to: routes.rm.dashboard, Icon: FiGrid },
    { label: "Employees", to: routes.rm.employees, Icon: FiUsers },
    { label: "Client approvals", to: routes.rm.clientApprovals, Icon: FiBriefcase },
    { label: "Support enquiries", to: routes.rm.supportTickets, Icon: FiHelpCircle },
  ] },
  { title: "Reports", links: [
    { label: "Module usage", to: routes.rm.reports.usage, Icon: FiBarChart2 },
    { label: "Inactive users", to: routes.rm.reports.inactiveUsers, Icon: FiUsers },
  ] },
];

export default function RmSidebar() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const [accountOpen, setAccountOpen] = useState(false);
  const active = (to: string) => pathname === to || (to === routes.rm.employees && pathname.startsWith("/rm/companies/"));
  const linkClass = (selected: boolean) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${selected ? "bg-purple-50 font-semibold text-[#852BAF]" : "text-slate-600 hover:bg-purple-50/70 hover:text-[#852BAF]"}`;

  return <nav aria-label="RM navigation" className="flex h-full w-64 flex-col border-r border-purple-100 bg-white">
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-purple-100 px-4">
      <img src={logo} alt="" className="h-9 w-9 rounded-lg bg-white object-contain p-1" />
      <div><p className="text-sm font-semibold text-slate-900">Reward Planners</p><p className="text-[11px] text-[#852BAF]">RM portal</p></div>
    </div>
    <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {groups.map(group => <div key={group.title}>
        <p className="mb-2 px-3 text-xs font-medium text-slate-400">{group.title}</p>
        <div className="space-y-1">{group.links.map(({ label, to, Icon }) => <Link key={to} to={to} aria-current={active(to) ? "page" : undefined} className={linkClass(active(to))}><Icon className="h-4 w-4 shrink-0" />{label}</Link>)}</div>
      </div>)}
    </div>
    <div className="m-3 rounded-xl border border-purple-100 p-2">
      {accountOpen && <div className="mb-2 space-y-1 border-b border-purple-100 pb-2">
        <Link to={routes.rm.profile} className={linkClass(active(routes.rm.profile))}><FiUser />Profile</Link>
        <Link to={routes.rm.changePassword} className={linkClass(active(routes.rm.changePassword))}><FiKey />Change password</Link>
        <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"><FiLogOut />Sign out</button>
      </div>}
      <button type="button" onClick={() => setAccountOpen(value => !value)} aria-expanded={accountOpen} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-purple-50">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-purple-50 text-sm font-semibold text-[#852BAF]">{(user?.name || user?.email || "R").charAt(0).toUpperCase()}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{user?.name || user?.email}</span>{user?.name && <span className="block truncate text-xs text-slate-500">{user.email}</span>}</span>
        <FiChevronUp className={`h-4 w-4 text-slate-400 ${accountOpen ? "" : "rotate-180"}`} />
      </button>
    </div>
  </nav>;
}
