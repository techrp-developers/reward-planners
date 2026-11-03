import { FiArrowRight, FiInbox, FiLayers, FiShoppingBag, FiXCircle } from "react-icons/fi";
import { Link } from "react-router-dom";
import { routes } from "../../../../../routes";

const workspaces = [
  { label: "Service catalogue", description: "Manage categories, services and pricing variants.", to: routes.service.catalog.replace(":section?", "categories"), Icon: FiLayers },
  { label: "Enquiries", description: "Review customer requests and update their progress.", to: routes.service.enquiries, Icon: FiInbox },
  { label: "Orders", description: "Track documents, delivery and service completion.", to: routes.service.orders, Icon: FiShoppingBag },
  { label: "Cancellations", description: "Review cancellation requests and refund details.", to: routes.service.cancellations, Icon: FiXCircle },
];

export default function ServiceDashboard() {
  return <div className="space-y-6">
    <header><h1 className="text-2xl font-semibold text-slate-900">Service overview</h1><p className="mt-1 text-sm text-slate-500">Manage your catalogue and daily service operations.</p></header>
    <section aria-label="Service operations" className="grid gap-4 md:grid-cols-2">
      {workspaces.map(({ label, description, to, Icon }) => <Link key={to} to={to} className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-purple-300">
        <span className="rounded-lg bg-purple-50 p-2.5 text-[#852BAF]"><Icon size={20} /></span>
        <div className="flex-1"><h2 className="font-semibold text-slate-900">{label}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{description}</p></div>
        <FiArrowRight className="mt-3 shrink-0 text-slate-400 group-hover:text-[#852BAF]" />
      </Link>)}
    </section>
  </div>;
}
