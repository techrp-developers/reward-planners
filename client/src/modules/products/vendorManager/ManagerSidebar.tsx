import BrandLogo from "../../../common/components/BrandLogo";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  FiBarChart2,
  FiChevronDown,
  FiChevronUp,
  FiFileText,
  FiGift,
  FiGrid,
  FiImage,
  FiKey,
  FiLogOut,
  FiPackage,
  FiShoppingCart,
  FiSliders,
  FiTag,
  FiUser,
  FiUsers,
  FiZap,
} from "react-icons/fi";
import { useAuth } from "../../../common/auth/useAuth";
import { routes } from "../../../routes";
import { useNotification } from "../../../common/notifications/useNotification";

interface NavChild {
  label: string;
  to: string;
  // Detail routes that should keep this link highlighted.
  matches?: string[];
}

interface NavItem {
  label: string;
  to?: string;
  Icon: React.ElementType;
  children?: NavChild[];
  matches?: string[];
  badgeCount?: number;
}

export default function ManagerNavbar() {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const { unreadCountByCategory } = useNotification();
  const [accountOpen, setAccountOpen] = useState(false);

  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: "Workspace",
      items: [
        { label: "Overview", to: routes.manager.dashboard, Icon: FiGrid },
        { label: "Vendors", to: routes.manager.vendors, Icon: FiUsers, matches: ["/manager/vendor-review/"], badgeCount: unreadCountByCategory("vendor_onboarding") },
        { label: "Products", to: routes.manager.products, Icon: FiPackage, matches: ["/manager/product/"] },
      ],
    },
    {
      title: "Catalog",
      items: [
        {
          label: "Categories",
          Icon: FiTag,
          children: [
            { label: "Categories", to: routes.manager.categories },
            { label: "Subcategories", to: routes.manager.subcategories },
            { label: "Type / Sub-type", to: routes.manager.subsubcategories },
          ],
        },
        {
          label: "Documents",
          Icon: FiFileText,
          children: [
            { label: "Add document", to: routes.manager.addDocument },
            { label: "Category link document", to: routes.manager.linkDocument },
          ],
        },
        { label: "Category attributes", to: routes.manager.attributes, Icon: FiSliders },
      ],
    },
    {
      title: "Sales",
      items: [
        {
          label: "Orders",
          Icon: FiShoppingCart,
          children: [
            { label: "Order list", to: routes.manager.orders.orderList, matches: ["/manager/order-view/"] },
            { label: "Returns & replacements", to: routes.manager.orders.returns },
            { label: "Cancellation requests", to: routes.manager.orders.cancellationRequest, matches: ["/manager/cancellation-detail/"] },
          ],
        },
        { label: "Flash sales", to: routes.manager.flashSales.list, Icon: FiZap, matches: ["/manager/flash-sales/"] },
        {
          label: "Rewards",
          Icon: FiGift,
          children: [
            { label: "Reward rules", to: routes.manager.rewards.rewardRule, matches: ["/manager/reward-create", "/manager/reward-edit/"] },
            { label: "BBPS & bus rewards", to: routes.manager.rewards.transactionRanges },
            { label: "Reward mapping", to: routes.manager.rewards.mapping },
          ],
        },
      ],
    },
    {
      title: "Content",
      items: [
        {
          label: "Home screens",
          Icon: FiImage,
          children: [
            { label: "Product", to: routes.manager.content.product },
            { label: "Service", to: routes.manager.content.service },
            { label: "Payment", to: routes.manager.content.payment },
            { label: "Mobile dashboard", to: routes.manager.content.mobileDashboard },
            { label: "Module icons", to: routes.manager.content.moduleIcons },
            { label: "App icons", to: routes.manager.content.appIcons },
            { label: "Dynamic splash screens", to: routes.manager.content.splashscreens },
          ],
        },
        { label: "Posters", to: routes.manager.posters.list, Icon: FiImage, matches: ["/manager/posters/"] },
        { label: "BBPS logos", to: routes.manager.bbpsLogos, Icon: FiImage },
      ],
    },
    {
      title: "Reports",
      items: [
        { label: "Stock report", to: routes.manager.reports.stock, Icon: FiBarChart2 },
        { label: "Order report", to: routes.manager.reports.orders, Icon: FiBarChart2 },
      ],
    },
  ];

  const active = ({ to, matches }: { to?: string; matches?: string[] }) => pathname === to || !!matches?.some((path) => pathname.startsWith(path));
  const hasActiveChild = (item: NavItem) => !!item.children?.some(active);
  const [openDropdown, setOpenDropdown] = useState<string | null>(() => groups.flatMap((group) => group.items).find(hasActiveChild)?.label ?? null);

  const linkClass = (selected: boolean) => `flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${selected ? "bg-purple-50 font-semibold text-[#852BAF]" : "text-slate-600 hover:bg-purple-50/70 hover:text-[#852BAF]"}`;

  return <nav aria-label="Vendor manager navigation" className="flex h-full w-64 flex-col border-r border-purple-100 bg-white">
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-purple-100 px-4">
      <BrandLogo className="w-32" />
      <div><p className="text-[11px] text-[#852BAF]">Vendor manager</p></div>
    </div>
    <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {groups.map((group) => <div key={group.title}>
        <p className="mb-2 px-3 text-xs font-medium text-slate-400">{group.title}</p>
        <div className="space-y-1">{group.items.map((item) => {
          if (!item.children) {
            const selected = active(item);
            return <Link key={item.label} to={item.to!} aria-current={selected ? "page" : undefined} className={linkClass(selected)}>
              <item.Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {!!item.badgeCount && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">{item.badgeCount > 99 ? "99+" : item.badgeCount}</span>}
            </Link>;
          }
          const expanded = openDropdown === item.label;
          return <div key={item.label}>
            <button type="button" onClick={() => setOpenDropdown(expanded ? null : item.label)} aria-expanded={expanded} className={linkClass(hasActiveChild(item) && !expanded)}>
              <item.Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
              <FiChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            {expanded && <div className="ml-5 mt-1 space-y-1 border-l border-purple-100 pl-3">
              {item.children.map((child) => {
                const selected = active(child);
                return <Link key={child.to} to={child.to} aria-current={selected ? "page" : undefined} className={`block rounded-lg px-3 py-2 text-sm transition-colors ${selected ? "bg-purple-50 font-semibold text-[#852BAF]" : "text-slate-600 hover:bg-purple-50/70 hover:text-[#852BAF]"}`}>{child.label}</Link>;
              })}
            </div>}
          </div>;
        })}</div>
      </div>)}
    </div>
    <div className="m-3 rounded-xl border border-purple-100 p-2">
      {accountOpen && <div className="mb-2 space-y-1 border-b border-purple-100 pb-2">
        <Link to={routes.manager.profile} className={linkClass(pathname === routes.manager.profile)}><FiUser />Profile</Link>
        <Link to={routes.manager.changePassword} className={linkClass(pathname === routes.manager.changePassword)}><FiKey />Change password</Link>
        <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"><FiLogOut />Sign out</button>
      </div>}
      <button type="button" onClick={() => setAccountOpen((value) => !value)} aria-expanded={accountOpen} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-purple-50">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-purple-50 text-sm font-semibold text-[#852BAF]">{(user?.name || user?.email || "M").charAt(0).toUpperCase()}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{user?.name || user?.email}</span>{user?.name && <span className="block truncate text-xs text-slate-500">{user.email}</span>}</span>
        <FiChevronUp className={`h-4 w-4 text-slate-400 ${accountOpen ? "" : "rotate-180"}`} />
      </button>
    </div>
  </nav>;
}
