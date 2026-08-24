import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiActivity, FiArrowRight, FiBriefcase, FiGrid, FiSmartphone, FiUserCheck, FiUsers } from "react-icons/fi";
import { api } from "../../common/api/api";
import { routes } from "../../routes";

interface CompanySummary { company_id: number; company_name: string; total_employee_count: number; active_employee_count: number; android_user_count: number; ios_user_count: number; }

function StatCard({ label, value, hint, icon, color }: { label: string; value: number; hint: string; icon: React.ReactNode; color: string }) {
  return <article className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"><span className={`absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-10 ${color}`} /><div className="relative flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-gray-400">{label}</p><p className="mt-3 text-3xl font-black tracking-tight text-gray-900">{value.toLocaleString()}</p><p className="mt-1 text-xs text-gray-500">{hint}</p></div><span className={`flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm ${color}`}>{icon}</span></div></article>;
}

export default function RmDashboard() {
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.get("/manager/employee-directory/companies")
      .then((response) => { if (active) setCompanies(response.data?.data ?? []); })
      .catch((requestError) => { console.error("Unable to load RM dashboard:", requestError); if (active) setError("Dashboard statistics are unavailable right now."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const stats = useMemo(() => companies.reduce((total, company) => ({ employees: total.employees + Number(company.total_employee_count || 0), activated: total.activated + Number(company.active_employee_count || 0), mobile: total.mobile + Number(company.android_user_count || 0) + Number(company.ios_user_count || 0) }), { employees: 0, activated: 0, mobile: 0 }), [companies]);
  const pending = Math.max(stats.employees - stats.activated, 0);
  const activationRate = stats.employees ? Math.round((stats.activated / stats.employees) * 100) : 0;
  const leadingCompanies = [...companies].sort((a, b) => Number(b.total_employee_count) - Number(a.total_employee_count)).slice(0, 5);

  return <div className="mx-auto w-full max-w-7xl space-y-6 pb-8">
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#5f2080] via-[#852BAF] to-[#FC3F78] p-6 text-white shadow-xl shadow-purple-200/60 sm:p-8"><span className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10" /><span className="absolute bottom-0 right-36 h-28 w-28 rounded-full bg-white/5" /><div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wider"><FiGrid /> Reward Manager</span><h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">Employee overview</h1><p className="mt-2 max-w-xl text-sm text-purple-100">Monitor organizations, employee onboarding, and mobile activation from one place.</p></div><Link to={routes.rm.employees} className="inline-flex w-fit items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-[#852BAF] shadow-lg transition hover:-translate-y-0.5">Manage employees <FiArrowRight /></Link></div></section>
    {error && <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</p>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Companies" value={companies.length} hint="Active organizations" icon={<FiBriefcase size={20} />} color="bg-violet-600" /><StatCard label="Employees" value={stats.employees} hint="All employee records" icon={<FiUsers size={20} />} color="bg-blue-600" /><StatCard label="Activated" value={stats.activated} hint={`${activationRate}% activation rate`} icon={<FiUserCheck size={20} />} color="bg-emerald-600" /><StatCard label="Pending" value={pending} hint={`${stats.mobile.toLocaleString()} mobile users`} icon={<FiActivity size={20} />} color="bg-amber-500" /></section>
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-gray-100 px-5 py-4"><div><h2 className="font-extrabold text-gray-900">Leading companies</h2><p className="mt-0.5 text-xs text-gray-500">Organizations with the largest employee records</p></div><Link to={routes.rm.employees} className="text-xs font-bold text-[#852BAF] hover:underline">View all</Link></div>{loading ? <div className="flex h-56 items-center justify-center"><div className="h-9 w-9 animate-spin rounded-full border-3 border-transparent border-r-[#FC3F78] border-t-[#852BAF]" /></div> : leadingCompanies.length ? <div className="divide-y divide-gray-100">{leadingCompanies.map((company) => { const rate = company.total_employee_count ? Math.round((company.active_employee_count / company.total_employee_count) * 100) : 0; return <Link key={company.company_id} to={`/rm/companies/${company.company_id}/employees`} className="flex items-center gap-4 px-5 py-4 transition hover:bg-purple-50/40"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 font-black text-[#852BAF]">{company.company_name.charAt(0).toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-3"><p className="truncate text-sm font-bold text-gray-900">{company.company_name}</p><p className="text-xs font-bold text-gray-600">{company.total_employee_count} employees</p></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-gradient-to-r from-[#852BAF] to-[#FC3F78]" style={{ width: `${rate}%` }} /></div><p className="mt-1 text-[11px] text-gray-400">{rate}% activated</p></div><FiArrowRight className="shrink-0 text-gray-300" /></Link>; })}</div> : <p className="p-12 text-center text-sm text-gray-500">No companies available.</p>}</section>
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><h2 className="font-extrabold text-gray-900">Activation health</h2><p className="mt-0.5 text-xs text-gray-500">Employee account adoption</p><div className="mx-auto mt-7 flex h-40 w-40 items-center justify-center rounded-full" style={{ background: `conic-gradient(#852BAF ${activationRate * 3.6}deg, #f3f4f6 0deg)` }}><div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white shadow-inner"><p className="text-3xl font-black text-gray-900">{activationRate}%</p><p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Activated</p></div></div><div className="mt-7 grid grid-cols-2 gap-3"><div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs font-bold text-emerald-600">Activated</p><p className="mt-1 text-xl font-black text-emerald-800">{stats.activated}</p></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-xs font-bold text-amber-600">Pending</p><p className="mt-1 text-xl font-black text-amber-800">{pending}</p></div></div><div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 p-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white"><FiSmartphone /></span><div><p className="text-xs font-bold text-gray-500">Mobile adoption</p><p className="text-sm font-black text-gray-900">{stats.mobile.toLocaleString()} registered devices</p></div></div></section>
    </div>
  </div>;
}
