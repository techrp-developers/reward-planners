import BrandLogo from "../../../common/components/BrandLogo";
import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  FiBarChart2,
  FiBookOpen,
  FiBox,
  FiBriefcase,
  FiChevronUp,
  FiClock,
  FiGrid,
  FiKey,
  FiLogOut,
  FiPackage,
  FiPlusSquare,
  FiRotateCcw,
  FiShield,
  FiShoppingCart,
  FiUser,
} from "react-icons/fi";
import { api } from "../../../common/api/api";
import { useAuth } from "../../../common/auth/useAuth";

interface NavLink {
  label: string;
  to: string;
  Icon: React.ElementType;
  // Detail routes that should keep this link highlighted.
  matches?: string[];
}

export default function VendorNavbar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const [vendorStatus, setVendorStatus] = useState<"approved" | "pending" | null>(null);
  const [loading, setLoading] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);

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

  const groups: { title: string; links: NavLink[] }[] = [
    {
      title: "Workspace",
      links: [
        { label: "Overview", to: "/vendor/dashboard", Icon: FiGrid },
        { label: isApproved ? "Onboarding details" : "Onboarding", to: "/vendor/onboarding", Icon: FiBriefcase },
      ],
    },
    ...(isApproved
      ? [
          {
            title: "Products",
            links: [
              { label: "Add product", to: "/vendor/products/add", Icon: FiPlusSquare },
              { label: "Product list", to: "/vendor/products/list", Icon: FiPackage, matches: ["/vendor/products/edit/", "/vendor/products/manage-product/", "/vendor/products/variant-", "/vendor/products/review/"] },
            ],
          },
          {
            title: "Orders",
            links: [
              { label: "All orders", to: "/vendor/orders/summary", Icon: FiShoppingCart, matches: ["/vendor/orders/details/"] },
              { label: "Returns & replacements", to: "/vendor/orders/returns", Icon: FiRotateCcw },
            ],
          },
          {
            title: "Reports",
            links: [
              { label: "Stock report", to: "/vendor/reports/stock", Icon: FiBox },
              { label: "Product report", to: "/vendor/reports/products", Icon: FiBarChart2 },
              { label: "Order report", to: "/vendor/reports/orders", Icon: FiBarChart2 },
            ],
          },
        ]
      : []),
    {
      title: "Help",
      links: [{ label: "Tutorials & FAQ", to: "/vendor/tutorials-faq", Icon: FiBookOpen }],
    },
  ];

  const active = ({ to, matches }: { to: string; matches?: string[] }) => pathname === to || !!matches?.some((path) => pathname.startsWith(path));
  const linkClass = (selected: boolean) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${selected ? "bg-purple-50 font-semibold text-[#852BAF]" : "text-slate-600 hover:bg-purple-50/70 hover:text-[#852BAF]"}`;

  if (loading) return null;

  return <nav aria-label="Vendor navigation" className="flex h-full w-64 flex-col border-r border-purple-100 bg-white">
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-purple-100 px-4">
      <BrandLogo className="w-32" />
      <div><p className="text-[11px] text-[#852BAF]">Vendor portal</p></div>
    </div>
    <div className="px-3 pt-4">
      <p className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${isApproved ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
        {isApproved ? <FiShield className="shrink-0" /> : <FiClock className="shrink-0" />}
        {isApproved ? "Verified partner" : "Pending approval"}
      </p>
    </div>
    <div className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {groups.map((group) => <div key={group.title}>
        <p className="mb-2 px-3 text-xs font-medium text-slate-400">{group.title}</p>
        <div className="space-y-1">{group.links.map((link) => {
          const selected = active(link);
          return <Link key={link.to} to={link.to} aria-current={selected ? "page" : undefined} className={linkClass(selected)}><link.Icon className="h-4 w-4 shrink-0" />{link.label}</Link>;
        })}</div>
      </div>)}
    </div>
    <div className="m-3 rounded-xl border border-purple-100 p-2">
      {accountOpen && <div className="mb-2 space-y-1 border-b border-purple-100 pb-2">
        <Link to="/vendor/profile" className={linkClass(pathname === "/vendor/profile")}><FiUser />Profile</Link>
        <Link to="/vendor/change-password" className={linkClass(pathname === "/vendor/change-password")}><FiKey />Change password</Link>
        <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"><FiLogOut />Sign out</button>
      </div>}
      <button type="button" onClick={() => setAccountOpen((value) => !value)} aria-expanded={accountOpen} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-purple-50">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-purple-50 text-sm font-semibold text-[#852BAF]">{(user?.name || user?.email || "V").charAt(0).toUpperCase()}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{user?.name || user?.email}</span>{user?.name && <span className="block truncate text-xs text-slate-500">{user.email}</span>}</span>
        <FiChevronUp className={`h-4 w-4 text-slate-400 ${accountOpen ? "" : "rotate-180"}`} />
      </button>
    </div>
  </nav>;
}
