import { useEffect, useMemo, useState } from "react";
import { FiChevronDown, FiLayers, FiRefreshCw, FiSearch } from "react-icons/fi";
import { api } from "../../../../../common/api/api";

interface Service { id: number; name: string; description?: string; category_name?: string; service_image?: string | null; price?: number; }
interface Variant { id: number; variant_name: string; title?: string; short_description?: string; price: number; image_url?: string | null; }

export default function ServiceCatalogPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [variants, setVariants] = useState<Record<number, Variant[]>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try { setLoading(true); setError(""); const response = await api.get("/v1/services/all-services", { params: { limit: 50 } }); setServices(response.data?.data || []); }
    catch { setError("Unable to load the service catalogue."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const toggle = async (serviceId: number) => {
    if (expanded === serviceId) return setExpanded(null);
    setExpanded(serviceId);
    if (!variants[serviceId]) {
      const response = await api.get(`/v1/service-variants/find/${serviceId}`);
      setVariants((current) => ({ ...current, [serviceId]: response.data?.data || [] }));
    }
  };
  const shown = useMemo(() => services.filter((service) => `${service.name} ${service.category_name || ""}`.toLowerCase().includes(search.toLowerCase())), [services, search]);
  const variantCount = Object.values(variants).reduce((total, rows) => total + rows.length, 0);

  return <main className="space-y-6">
    <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#25103d] via-[#68258d] to-[#c33076] p-7 text-white shadow-[0_24px_65px_rgba(91,33,124,0.24)]"><div className="absolute -right-12 -top-20 h-60 w-60 rounded-full bg-white/10 blur-2xl" /><div className="relative flex items-center justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.24em] text-purple-200">Catalogue workspace</p><h1 className="mt-1 text-3xl font-black">Services & Variants</h1><p className="mt-2 text-sm text-purple-100/80">Review every active service and expand it to see its available variants.</p></div><button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold hover:bg-white/20"><FiRefreshCw className={loading ? "animate-spin" : ""} /> Refresh</button></div></header>
    <section className="grid gap-4 sm:grid-cols-2"><article className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Active services</p><p className="mt-2 text-3xl font-black text-slate-900">{services.length}</p></article><article className="rounded-2xl border border-purple-100 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">Variants loaded</p><p className="mt-2 text-3xl font-black text-slate-900">{variantCount}</p></article></section>
    <label className="relative block"><FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search services or categories" className="w-full rounded-2xl border border-purple-100 bg-white py-3.5 pl-11 pr-4 text-sm shadow-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100" /></label>
    <section className="space-y-3">{loading ? <div className="grid min-h-64 place-items-center text-[#852BAF]"><FiRefreshCw className="animate-spin text-3xl" /></div> : error ? <div className="rounded-2xl border border-red-100 bg-red-50 p-8 text-center font-semibold text-red-600">{error}</div> : shown.map((service) => <article key={service.id} className="overflow-hidden rounded-2xl border border-purple-100 bg-white shadow-sm"><button onClick={() => void toggle(service.id)} className="flex w-full items-center gap-4 p-5 text-left hover:bg-purple-50/40"><span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-purple-50 text-[#852BAF]">{service.service_image ? <img src={service.service_image} alt="" className="h-full w-full object-cover" /> : <FiLayers />}</span><span className="min-w-0 flex-1"><span className="block font-extrabold text-slate-900">{service.name}</span><span className="block truncate text-xs text-slate-400">{service.category_name || "Uncategorised"} · From ₹{Number(service.price || 0).toLocaleString("en-IN")}</span></span><FiChevronDown className={`text-[#852BAF] transition ${expanded === service.id ? "rotate-180" : ""}`} /></button>{expanded === service.id && <div className="border-t border-slate-100 bg-slate-50/60 p-5"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(variants[service.id] || []).map((variant) => <div key={variant.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-800">{variant.title || variant.variant_name}</p><p className="mt-1 text-xs text-slate-400">{variant.variant_name}</p></div><span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">₹{Number(variant.price).toLocaleString("en-IN")}</span></div>{variant.short_description && <p className="mt-3 text-xs leading-5 text-slate-500">{variant.short_description}</p>}</div>)}{variants[service.id]?.length === 0 && <p className="text-sm text-slate-400">No active variants available.</p>}</div></div>}</article>)}</section>
  </main>;
}
