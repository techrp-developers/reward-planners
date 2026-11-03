import BrandLogo from "../../../common/components/BrandLogo";
import { NavLink } from "react-router-dom";
import { FiGrid, FiList, FiInbox, FiShoppingBag, FiXCircle, FiUser, FiLock, FiLogOut } from "react-icons/fi";
import { useAuth } from "../../../common/auth/useAuth";
import { routes } from "../../../routes";

const groups = [
  { label: "Workspace", links: [
    { label: "Dashboard", to: routes.service.dashboard, Icon: FiGrid },
    { label: "Enquiries", to: routes.service.enquiries, Icon: FiInbox },
    { label: "Orders", to: routes.service.orders, Icon: FiShoppingBag },
    { label: "Cancellations", to: routes.service.cancellations, Icon: FiXCircle },
  ] },
  { label: "Catalogue", links: [
    { label: "Categories", to: routes.service.catalog.replace(":section?", "categories"), Icon: FiList },
    { label: "Services", to: routes.service.catalog.replace(":section?", "services"), Icon: FiList },
    { label: "Variants", to: routes.service.catalog.replace(":section?", "variants"), Icon: FiList },
  ] },
  { label: "Account", links: [
    { label: "Profile", to: routes.service.profile, Icon: FiUser },
    { label: "Change password", to: routes.service.changePassword, Icon: FiLock },
  ] },
];

export default function ServiceNavbar() {
  const { user, logout } = useAuth();
  return <nav aria-label="Service Manager navigation" className="fixed inset-y-0 left-0 flex w-64 flex-col border-r border-slate-200 bg-white">
    <div className="border-b border-slate-100 px-6 py-5"><BrandLogo className="w-32" /><p className="mt-2 text-xs font-medium text-slate-500">Service Manager</p></div>
    <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {groups.map(group => <section key={group.label}><h2 className="mb-2 px-3 text-xs font-medium text-slate-400">{group.label}</h2><div className="space-y-1">
        {group.links.map(({ label, to, Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? "bg-purple-50 text-[#852BAF]" : "text-slate-600 hover:bg-slate-50"}`}><Icon size={17} /><span>{label}</span></NavLink>)}
      </div></section>)}
    </div>
    <div className="border-t border-slate-100 p-4"><p className="truncate px-2 text-sm font-medium text-slate-800">{user?.name || user?.email}</p><button onClick={logout} className="mt-2 flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-500 hover:bg-red-50 hover:text-red-600"><FiLogOut size={17} />Sign out</button></div>
  </nav>;
}
