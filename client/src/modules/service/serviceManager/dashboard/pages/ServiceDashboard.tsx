import { FiArrowRight, FiGrid, FiInbox, FiLayers, FiShoppingBag, FiXCircle, FiZap } from "react-icons/fi";
import { Link } from "react-router-dom";
import { routes } from "../../../../../routes";

const workspaces = [
  { label: "Services & variants", eyebrow: "Catalogue", description: "Manage categories, services and their variants.", to: routes.service.catalog.replace(":section?", "categories"), Icon: FiLayers, tone: "bg-purple-50 text-[#852BAF]" },
  { label: "Service enquiries", eyebrow: "Customer requests", description: "Review and progress incoming customer enquiries.", to: routes.service.enquiries, Icon: FiInbox, tone: "bg-amber-50 text-amber-600" },
  { label: "Service orders", eyebrow: "Fulfilment", description: "Track documentation, delivery and completion.", to: routes.service.orders, Icon: FiShoppingBag, tone: "bg-blue-50 text-blue-600" },
  { label: "Cancellations", eyebrow: "Resolutions", description: "Review cancellation and refund requests.", to: routes.service.cancellations, Icon: FiXCircle, tone: "bg-red-50 text-red-600" },
];

export default function ServiceDashboard() {
  return (
    <main className="space-y-8">
      <header className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#25103d] via-[#68258d] to-[#c33076] p-7 text-white shadow-[0_24px_65px_rgba(91,33,124,0.24)] sm:p-10">
        <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-fuchsia-300/10 blur-3xl" />
        <div className="relative grid items-end gap-8 lg:grid-cols-[1fr_auto]">
          <div>
            <span className="grid h-13 w-13 place-items-center rounded-2xl border border-white/20 bg-white/10 shadow-inner backdrop-blur-sm"><FiGrid size={23} /></span>
            <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.25em] text-purple-200">Service manager workspace</p>
            <h1 className="mt-1 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">Service operations, all in one place.</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-purple-100/80">Manage your catalogue and move every customer request from enquiry to successful completion.</p>
          </div>
          <div className="hidden items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 backdrop-blur-sm lg:flex">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15"><FiZap /></span>
            <span><span className="block text-[10px] font-bold uppercase tracking-widest text-purple-200">Quick access</span><span className="text-sm font-extrabold">4 operation areas</span></span>
          </div>
        </div>
      </header>

      <section aria-labelledby="operations-heading">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div><h2 id="operations-heading" className="text-xl font-black text-slate-900">Operations</h2><p className="mt-1 text-sm text-slate-500">Choose a workspace to continue</p></div>
          <span className="hidden rounded-full border border-purple-100 bg-purple-50 px-3 py-1 text-xs font-bold text-[#852BAF] sm:block">4 workspaces</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {workspaces.map(({ label, eyebrow, description, to, Icon, tone }) => (
            <Link key={label} to={to} className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_12px_35px_rgba(67,31,91,0.06)] transition duration-200 hover:-translate-y-1 hover:border-purple-200 hover:shadow-[0_20px_45px_rgba(83,35,112,0.12)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-purple-200">
              <div className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-[#852BAF] to-[#FC3F78] transition-transform duration-300 group-hover:scale-x-100" />
              <div className="flex items-start gap-4">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${tone}`}><Icon size={20} /></span>
                <span className="min-w-0 flex-1"><span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">{eyebrow}</span><span className="mt-1 block font-extrabold text-slate-900">{label}</span><span className="mt-1.5 block text-sm leading-5 text-slate-500">{description}</span></span>
                <span className="mt-2 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-50 text-slate-300 transition group-hover:bg-purple-50 group-hover:text-[#852BAF]"><FiArrowRight className="transition-transform group-hover:translate-x-0.5" /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
