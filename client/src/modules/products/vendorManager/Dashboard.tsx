import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiAlertCircle, FiArrowRight, FiBox, FiFileText, FiGift, FiGrid, FiLayers, FiShoppingCart, FiTag, FiUsers, FiZap } from "react-icons/fi";
import { api } from "../../../common/api/api";
import { routes } from "../../../routes";
import DashboardCharts, { type MonthlyMetric } from "./ManagerChart";

interface ManagerStats {
  totalVendors: number; pendingApprovals: number; sentForApproval: number; approvedVendors: number;
  totalProducts: number; sentForApprovalProducts: number; approvedProducts: number; resubmissionProducts: number;
  totalOrders: number; cancellationRequests: number; grossOrderValue: number; categories: number; subcategories: number;
  attributes: number; documents: number; totalCampaigns: number; activeCampaigns: number; rewardRules: number; activeRewardRules: number;
  charts: MonthlyMetric[];
}

const emptyStats: ManagerStats = { totalVendors: 0, pendingApprovals: 0, sentForApproval: 0, approvedVendors: 0, totalProducts: 0, sentForApprovalProducts: 0, approvedProducts: 0, resubmissionProducts: 0, totalOrders: 0, cancellationRequests: 0, grossOrderValue: 0, categories: 0, subcategories: 0, attributes: 0, documents: 0, totalCampaigns: 0, activeCampaigns: 0, rewardRules: 0, activeRewardRules: 0, charts: [] };
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value || 0);

function StatCard({ label, value, detail, icon: Icon, color }: { label: string; value: string | number; detail: string; icon: React.ElementType; color: string }) {
  return <article className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><span className={`absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-10 ${color}`} /><div className="relative flex justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-gray-400">{label}</p><p className="mt-3 text-3xl font-black text-gray-900">{value}</p><p className="mt-1 text-xs text-gray-500">{detail}</p></div><span className={`grid h-11 w-11 place-items-center rounded-xl text-white ${color}`}><Icon size={20} /></span></div></article>;
}

export default function ManagerDashboard() {
  const [stats, setStats] = useState(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; api.get("/manager/stats").then((response) => { if (active && response.data?.success) setStats({ ...emptyStats, ...response.data.data, charts: response.data.data?.charts ?? [] }); }).catch((requestError) => { console.error("Error fetching manager stats:", requestError); if (active) setError("Unable to load dashboard statistics."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);

  const modules = [
    { title: "Vendors", count: stats.totalVendors, detail: `${stats.sentForApproval} awaiting review`, to: routes.manager.vendors, Icon: FiUsers, color: "bg-violet-50 text-violet-700" },
    { title: "Products", count: stats.totalProducts, detail: `${stats.sentForApprovalProducts} awaiting approval`, to: routes.manager.products, Icon: FiBox, color: "bg-blue-50 text-blue-700" },
    { title: "Catalog", count: stats.categories + stats.subcategories, detail: `${stats.attributes} active attributes`, to: routes.manager.categories, Icon: FiLayers, color: "bg-cyan-50 text-cyan-700" },
    { title: "Documents", count: stats.documents, detail: "Product document types", to: routes.manager.addDocument, Icon: FiFileText, color: "bg-slate-100 text-slate-700" },
    { title: "Orders", count: stats.totalOrders, detail: `${stats.cancellationRequests} cancellation requests`, to: routes.manager.orders.orderList, Icon: FiShoppingCart, color: "bg-emerald-50 text-emerald-700" },
    { title: "Flash sales", count: stats.totalCampaigns, detail: `${stats.activeCampaigns} currently active`, to: routes.manager.flashSales.list, Icon: FiZap, color: "bg-amber-50 text-amber-700" },
    { title: "Reward rules", count: stats.rewardRules, detail: `${stats.activeRewardRules} active rules`, to: routes.manager.rewards.rewardRule, Icon: FiGift, color: "bg-pink-50 text-pink-700" },
  ];

  if (loading) return <div className="grid min-h-[65vh] place-items-center"><div className="h-11 w-11 animate-spin rounded-full border-3 border-transparent border-r-[#FC3F78] border-t-[#852BAF]" /></div>;
  return <div className="mx-auto w-full max-w-7xl space-y-6 pb-8">
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#25103d] via-[#67218d] to-[#FC3F78] p-7 text-white shadow-xl shadow-purple-200/60"><span className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10" /><div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wider"><FiGrid /> Vendor operations</span><h1 className="mt-4 text-3xl font-black sm:text-4xl">Manager dashboard</h1><p className="mt-2 max-w-xl text-sm text-purple-100">Live operational view across vendors, products, catalog, orders, campaigns, and rewards.</p></div><Link to={routes.manager.vendors} className="inline-flex w-fit items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-[#852BAF]">Review vendors <FiArrowRight /></Link></div></section>
    {error && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Approved vendors" value={stats.approvedVendors} detail={`${stats.sentForApproval} sent for approval`} icon={FiUsers} color="bg-violet-600" /><StatCard label="Approved products" value={stats.approvedProducts} detail={`${stats.resubmissionProducts} need resubmission`} icon={FiBox} color="bg-blue-600" /><StatCard label="Orders" value={stats.totalOrders} detail={`${stats.cancellationRequests} cancellation requests`} icon={FiShoppingCart} color="bg-emerald-600" /><StatCard label="Gross order value" value={money(stats.grossOrderValue)} detail="Excludes cancelled orders" icon={FiTag} color="bg-pink-600" /></section>
    {(stats.sentForApproval + stats.sentForApprovalProducts + stats.cancellationRequests > 0) && <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4"><FiAlertCircle className="text-xl text-amber-600" /><p className="flex-1 text-sm font-bold text-amber-900">Attention needed: {stats.sentForApproval} vendor reviews, {stats.sentForApprovalProducts} product reviews, and {stats.cancellationRequests} cancellation requests.</p><Link to={routes.manager.vendors} className="text-xs font-extrabold text-amber-700 hover:underline">Start reviewing</Link></section>}
    <DashboardCharts metrics={stats.charts} />
    <section><div className="mb-3"><h2 className="text-lg font-extrabold text-gray-900">Module snapshot</h2><p className="text-xs text-gray-500">Jump directly into each Vendor Manager workspace</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{modules.map(({ title, count, detail, to, Icon, color }) => <Link key={title} to={to} className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-purple-200 hover:shadow-md"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${color}`}><Icon size={19} /></span><div className="min-w-0 flex-1"><div className="flex items-center justify-between"><p className="font-extrabold text-gray-900">{title}</p><p className="text-xl font-black text-gray-900">{count}</p></div><p className="mt-0.5 truncate text-xs text-gray-500">{detail}</p></div><FiArrowRight className="text-gray-300 transition group-hover:translate-x-1 group-hover:text-[#852BAF]" /></Link>)}</div></section>
  </div>;
}
