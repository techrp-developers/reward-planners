import { useCallback, useEffect, useState } from "react";
import { FiEdit2, FiLayers, FiPlus, FiRefreshCw, FiTag, FiTrash2, FiX } from "react-icons/fi";
import axios from "axios";
import { Link, Navigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import { api } from "../../../../../common/api/api";
import { routes } from "../../../../../routes";

interface Category { id: number; name: string; icon?: string | null; status?: number; }
interface Service { id: number; category_id: number; name: string; description?: string; price: number; estimated_days?: number; service_image?: string | null; status?: number; }
interface Variant { id: number; service_id?: number; variant_name: string; title: string; short_description: string; price: number; image_url?: string | null; status?: number; }
type Entity = Category | Service | Variant;
type Kind = "category" | "service" | "variant";
type Section = "categories" | "services" | "variants";

const message = (error: unknown) => axios.isAxiosError(error) ? String(error.response?.data?.message || "Please try again.") : "Please try again.";
const input = "mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100";

export default function ServiceCatalogPage() {
  const { section = "categories" } = useParams();
  const current = section as Section;
  const [categories, setCategories] = useState<Category[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<Kind | null>(null);
  const [editing, setEditing] = useState<Entity | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadCategories = useCallback(async () => {
    const response = await api.get("/v1/category/all-categories");
    const rows = response.data?.data || [];
    setCategories(rows);
    setCategoryId((value) => value && rows.some((row: Category) => row.id === value) ? value : rows[0]?.id || null);
  }, []);
  const loadServices = useCallback(async () => {
    if (!categoryId) { setServices([]); return; }
    const response = await api.get("/v1/service/all-services", { params: { category_id: categoryId, limit: 50 } });
    const rows = response.data?.data || [];
    setServices(rows);
    setServiceId((value) => value && rows.some((row: Service) => row.id === value) ? value : rows[0]?.id || null);
  }, [categoryId]);
  const loadVariants = useCallback(async () => {
    if (!serviceId) { setVariants([]); return; }
    const response = await api.get(`/v1/service-variant/find/${serviceId}`);
    setVariants(response.data?.data || []);
  }, [serviceId]);
  const refresh = useCallback(async () => { try { setLoading(true); await loadCategories(); } catch (error) { await Swal.fire("Unable to load catalogue", message(error), "error"); } finally { setLoading(false); } }, [loadCategories]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void loadServices(); }, [loadServices]);
  useEffect(() => { void loadVariants(); }, [loadVariants]);

  const openCreate = (kind: Kind) => { setEditing(null); setDialog(kind); };
  const openEdit = (kind: Kind, entity: Entity) => { setEditing(entity); setDialog(kind); };
  const reloadKind = async (kind: Kind) => { if (kind === "category") await loadCategories(); else if (kind === "service") await loadServices(); else await loadVariants(); };
  const remove = async (kind: Kind, entity: Entity) => {
    const label = "name" in entity ? entity.name : "title" in entity ? entity.title : "item";
    const result = await Swal.fire({ title: `Remove ${kind}?`, text: `${label} will no longer be available.`, icon: "warning", showCancelButton: true, confirmButtonText: "Remove", confirmButtonColor: "#DC2626" });
    if (!result.isConfirmed) return;
    const path = kind === "category" ? `/v1/category/remove/${entity.id}` : kind === "service" ? `/v1/service/remove/${entity.id}` : `/v1/service-variant/remove/${entity.id}`;
    try { await api.delete(path); await reloadKind(kind); await Swal.fire({ icon: "success", title: "Removed", timer: 900, showConfirmButton: false }); } catch (error) { await Swal.fire("Unable to remove", message(error), "error"); }
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!dialog) return; const data = new FormData(event.currentTarget); data.set("status", "1");
    if (dialog === "service" && categoryId) data.set("category_id", String(categoryId));
    if (dialog === "variant" && serviceId) data.set("service_id", String(serviceId));
    const base = dialog === "category" ? "/v1/category" : dialog === "service" ? "/v1/service" : "/v1/service-variant";
    const create = dialog === "category" ? "create-category" : dialog === "service" ? "create-service" : "create-variant";
    const update = dialog === "category" ? "update" : dialog === "service" ? "update" : "update-variant";
    try { setSaving(true); if (editing) await api.put(`${base}/${update}/${editing.id}`, data); else await api.post(`${base}/${create}`, data); await reloadKind(dialog); setDialog(null); setEditing(null); await Swal.fire({ icon: "success", title: `${dialog[0].toUpperCase()}${dialog.slice(1)} ${editing ? "updated" : "created"}`, timer: 1000, showConfirmButton: false }); } catch (error) { await Swal.fire("Unable to save", message(error), "error"); } finally { setSaving(false); }
  };

  const tabs: { key: Section; label: string }[] = [{ key: "categories", label: "1. Categories" }, { key: "services", label: "2. Services" }, { key: "variants", label: "3. Variants" }];
  const selectedCategory = categories.find((row) => row.id === categoryId);
  const selectedService = services.find((row) => row.id === serviceId);
  const title = current === "categories" ? "Service Categories" : current === "services" ? "Services" : "Service Variants";
  const kind: Kind = current === "categories" ? "category" : current === "services" ? "service" : "variant";
  const canAdd = current === "categories" || current === "services" && Boolean(categoryId) || current === "variants" && Boolean(serviceId);
  if (!tabs.some((tab) => tab.key === current)) return <Navigate to={routes.service.catalog.replace(":section?", "categories")} replace />;

  return <main className="space-y-6"><header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#25103d] via-[#68258d] to-[#c33076] p-7 text-white shadow-[0_24px_65px_rgba(91,33,124,0.24)]"><div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10 blur-2xl" /><div className="relative flex flex-wrap items-center justify-between gap-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.24em] text-purple-200">Service catalogue</p><h1 className="mt-1 text-3xl font-black">{title}</h1><p className="mt-2 text-sm text-purple-100/80">Manage the catalogue in sequence: categories, their services, and service variants.</p></div><button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold hover:bg-white/20"><FiRefreshCw className={loading ? "animate-spin" : ""} /> Refresh</button></div></header>
    <nav className="grid gap-2 rounded-2xl border border-purple-100 bg-white p-2 shadow-sm sm:grid-cols-3">{tabs.map((tab) => <Link key={tab.key} to={routes.service.catalog.replace(":section?", tab.key)} className={`rounded-xl px-4 py-3 text-center text-sm font-extrabold transition ${current === tab.key ? "bg-[#852BAF] text-white shadow" : "text-slate-500 hover:bg-purple-50 hover:text-[#852BAF]"}`}>{tab.label}</Link>)}</nav>
    {current !== "categories" && <section className="grid gap-3 rounded-2xl border border-purple-100 bg-white p-4 shadow-sm md:grid-cols-2"><label className="text-xs font-bold text-slate-500">Category<select value={categoryId || ""} onChange={(event) => setCategoryId(Number(event.target.value))} className={input}>{categories.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>{current === "variants" && <label className="text-xs font-bold text-slate-500">Service<select value={serviceId || ""} onChange={(event) => setServiceId(Number(event.target.value))} className={input}>{services.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}</section>}
    <section className="overflow-hidden rounded-3xl border border-purple-100 bg-white shadow-[0_18px_55px_rgba(67,31,91,0.08)]"><div className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div><h2 className="font-black text-slate-900">{title}</h2><p className="mt-1 text-xs text-slate-400">{current === "services" ? `Category: ${selectedCategory?.name || "select a category"}` : current === "variants" ? `Service: ${selectedService?.name || "select a service"}` : `${categories.length} active categories`}</p></div><button disabled={!canAdd} onClick={() => openCreate(kind)} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-4 py-2.5 text-sm font-extrabold text-white shadow disabled:cursor-not-allowed disabled:opacity-40"><FiPlus /> Add {kind}</button></div>
      <div className="p-5">{loading ? <div className="grid min-h-60 place-items-center"><FiRefreshCw className="animate-spin text-3xl text-[#852BAF]" /></div> : current === "categories" ? <Grid entities={categories} kind="category" edit={openEdit} remove={remove} /> : current === "services" ? <Grid entities={services} kind="service" edit={openEdit} remove={remove} /> : <Grid entities={variants} kind="variant" edit={openEdit} remove={remove} />}</div></section>
    {dialog && <Editor kind={dialog} entity={editing} saving={saving} close={() => { setDialog(null); setEditing(null); }} submit={submit} />}
  </main>;
}

function Grid({ entities, kind, edit, remove }: { entities: Entity[]; kind: Kind; edit: (kind: Kind, entity: Entity) => void; remove: (kind: Kind, entity: Entity) => void }) {
  if (!entities.length) return <div className="grid min-h-56 place-items-center text-center text-sm text-slate-400">No {kind}s found. Use Add {kind} to create one.</div>;
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{entities.map((entity) => { const name = "name" in entity ? entity.name : entity.title; const subtitle = "variant_name" in entity ? entity.variant_name : "price" in entity ? `₹${Number(entity.price).toLocaleString("en-IN")}` : "Service category"; const image = "icon" in entity ? entity.icon : "service_image" in entity ? entity.service_image : entity.image_url; return <article key={entity.id} className="rounded-2xl border border-slate-100 p-4 transition hover:border-purple-200 hover:shadow-md"><div className="flex items-start gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-purple-50 text-[#852BAF]">{image ? <img src={image} alt="" className="h-full w-full object-cover" /> : kind === "category" ? <FiTag /> : <FiLayers />}</span><div className="min-w-0 flex-1"><h3 className="truncate font-extrabold text-slate-900">{name}</h3><p className="mt-1 text-xs font-semibold text-slate-400">{subtitle}</p></div></div><div className="mt-4 flex gap-2 border-t border-slate-100 pt-3"><button onClick={() => edit(kind, entity)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-purple-50 px-3 py-2 text-xs font-bold text-[#852BAF] hover:bg-[#852BAF] hover:text-white"><FiEdit2 /> Edit</button><button onClick={() => void remove(kind, entity)} className="inline-flex items-center justify-center rounded-lg bg-red-50 px-3 py-2 text-red-600 hover:bg-red-600 hover:text-white" aria-label={`Remove ${name}`}><FiTrash2 /></button></div></article>; })}</div>;
}

function Editor({ kind, entity, saving, close, submit }: { kind: Kind; entity: Entity | null; saving: boolean; close: () => void; submit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  const category = kind === "category" ? entity as Category | null : null; const service = kind === "service" ? entity as Service | null : null; const variant = kind === "variant" ? entity as Variant | null : null;
  return <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && close()}><div className="w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="flex items-center justify-between bg-gradient-to-r from-[#25103d] to-[#852BAF] px-6 py-5 text-white"><div><p className="text-[10px] font-bold uppercase tracking-wider text-purple-200">Catalogue editor</p><h2 className="text-xl font-black">{entity ? "Edit" : "Add"} {kind}</h2></div><button onClick={close} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 hover:bg-white/20"><FiX /></button></div><form onSubmit={submit} className="grid gap-4 p-6 sm:grid-cols-2">
    {kind === "category" && <><Field label="Category name" name="name" value={category?.name} /><File label="Category icon" name="icon" /></>}
    {kind === "service" && <><Field label="Service name" name="name" value={service?.name} wide /><Field label="Starting price" name="price" type="number" value={service?.price} /><Field label="Estimated days" name="estimated_days" type="number" value={service?.estimated_days} /><Field label="Description" name="description" value={service?.description} wide area /><File label="Service image" name="service_image" wide /></>}
    {kind === "variant" && <><Field label="Variant name" name="variant_name" value={variant?.variant_name} /><Field label="Display title" name="title" value={variant?.title} /><Field label="Price" name="price" type="number" value={variant?.price} /><File label="Variant image" name="service_variant_image" /><Field label="Short description" name="short_description" value={variant?.short_description} wide area /></>}
    <div className="flex justify-end gap-3 pt-2 sm:col-span-2"><button type="button" onClick={close} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600">Cancel</button><button disabled={saving} className="rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-5 py-3 text-sm font-extrabold text-white shadow disabled:opacity-50">{saving ? "Saving..." : entity ? "Save changes" : `Create ${kind}`}</button></div>
  </form></div></div>;
}
function Field({ label, name, value, type = "text", wide, area }: { label: string; name: string; value?: string | number; type?: string; wide?: boolean; area?: boolean }) { return <label className={`text-xs font-bold text-slate-500 ${wide ? "sm:col-span-2" : ""}`}>{label}{area ? <textarea name={name} required defaultValue={value} className={`${input} min-h-24`} /> : <input name={name} required type={type} min={type === "number" ? 0 : undefined} step={type === "number" ? "0.01" : undefined} defaultValue={value} className={input} />}</label>; }
function File({ label, name, wide }: { label: string; name: string; wide?: boolean }) { return <label className={`text-xs font-bold text-slate-500 ${wide ? "sm:col-span-2" : ""}`}>{label}<input name={name} type="file" accept="image/*" className={input} /><span className="mt-1 block text-[10px] font-medium text-slate-400">Optional when editing</span></label>; }
