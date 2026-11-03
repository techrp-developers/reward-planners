import { useCallback, useEffect, useState } from "react";
import { FiEdit2, FiLayers, FiPlus, FiRefreshCw, FiTag, FiTrash2, FiX } from "react-icons/fi";
import axios from "axios";
import { Link, Navigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import { api } from "../../../../../common/api/api";
import { routes } from "../../../../../routes";

interface Category { id: number; name: string; icon?: string | null; image_url?: string | null; status?: number; }
interface Service { id: number; category_id: number; name: string; description?: string; price: number; estimated_days?: number; service_image?: string | null; image_url?: string | null; status?: number; }
interface Variant { id: number; service_id?: number; variant_name: string; title: string; short_description: string; price: number; image_url?: string | null; status?: number; }
type Entity = Category | Service | Variant;
type Kind = "category" | "service" | "variant";
type Section = "categories" | "services" | "variants";

const message = (error: unknown) => axios.isAxiosError(error) ? String(error.response?.data?.message || "Please try again.") : "Please try again.";
const input = "mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100";

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

  const tabs: { key: Section; label: string }[] = [{ key: "categories", label: "Categories" }, { key: "services", label: "Services" }, { key: "variants", label: "Variants" }];
  const selectedCategory = categories.find((row) => row.id === categoryId);
  const selectedService = services.find((row) => row.id === serviceId);
  const title = current === "categories" ? "Service Categories" : current === "services" ? "Services" : "Service Variants";
  const kind: Kind = current === "categories" ? "category" : current === "services" ? "service" : "variant";
  const canAdd = current === "categories" || current === "services" && Boolean(categoryId) || current === "variants" && Boolean(serviceId);
  if (!tabs.some((tab) => tab.key === current)) return <Navigate to={routes.service.catalog.replace(":section?", "categories")} replace />;

  const entities = current === "categories" ? categories : current === "services" ? services : variants;
  const description = current === "categories"
    ? "Group related services into categories."
    : current === "services" ? "Manage the services available within each category."
    : "Manage pricing and options for the selected service.";

  return <main className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold text-slate-900">Service catalogue</h1><p className="mt-1 text-sm text-slate-500">Organise your categories, services and variants.</p></div>
      <button onClick={() => void refresh()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"><FiRefreshCw className={loading ? "animate-spin" : ""} /> Refresh</button>
    </header>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <nav aria-label="Catalogue sections" className="flex overflow-x-auto border-b border-slate-200 px-4 sm:px-6">
        {tabs.map(tab => <Link key={tab.key} aria-current={current === tab.key ? "page" : undefined} to={routes.service.catalog.replace(":section?", tab.key)} className={`shrink-0 border-b-2 px-4 py-4 text-sm font-medium transition-colors ${current === tab.key ? "border-[#852BAF] text-[#852BAF]" : "border-transparent text-slate-500 hover:text-slate-900"}`}>{tab.label}</Link>)}
      </nav>
      <div className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-lg font-semibold text-slate-900">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div>
          <button disabled={!canAdd} onClick={() => openCreate(kind)} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#852BAF] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6E2391] disabled:opacity-40"><FiPlus /> Add {kind}</button>
        </div>
        {current !== "categories" && <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-600">Category<select value={categoryId || ""} onChange={event => setCategoryId(Number(event.target.value))} className={`${input} bg-white`} disabled={!categories.length}>{!categories.length && <option value="">No categories available</option>}{categories.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
          {current === "variants" && <label className="text-sm font-medium text-slate-600">Service<select value={serviceId || ""} onChange={event => setServiceId(Number(event.target.value))} className={`${input} bg-white`} disabled={!services.length}>{!services.length && <option value="">No services available</option>}{services.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
        </div>}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>{entities.length} {current} loaded</span>{current !== "categories" && selectedCategory && <><span aria-hidden="true">/</span><span>{selectedCategory.name}</span></>}{current === "variants" && selectedService && <><span aria-hidden="true">/</span><span>{selectedService.name}</span></>}</div>
        {loading ? <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500"><FiRefreshCw className="animate-spin" /> Loading catalogue...</div> : <Grid entities={entities} kind={kind} edit={openEdit} remove={remove} canAdd={canAdd} />}
      </div>
    </section>
    {dialog && <Editor kind={dialog} entity={editing} saving={saving} close={() => { setDialog(null); setEditing(null); }} submit={submit} />}
  </main>;
}

function Grid({ entities, kind, edit, remove, canAdd }: { entities: Entity[]; kind: Kind; edit: (kind: Kind, entity: Entity) => void; remove: (kind: Kind, entity: Entity) => void; canAdd: boolean }) {
  if (!entities.length) return <div className="rounded-lg border border-dashed border-slate-200 px-6 py-12 text-center"><FiLayers className="mx-auto mb-3 text-slate-400" size={24} /><p className="font-medium text-slate-700">No {kind === "category" ? "categories" : `${kind}s`} yet</p><p className="mt-1 text-sm text-slate-500">{canAdd ? `Use Add ${kind} to create your first entry.` : kind === "service" ? "Create a category before adding services." : "Select a category with services before adding variants."}</p></div>;
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{entities.map(entity => {
    const name = "name" in entity ? entity.name : entity.title;
    const image = ("icon" in entity ? entity.icon : null) || ("service_image" in entity ? entity.service_image : null) || entity.image_url;
    const description = "description" in entity ? entity.description : "short_description" in entity ? entity.short_description : null;
    return <article key={entity.id} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-start gap-3"><span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-100 bg-slate-50 text-[#852BAF]">{image ? <img src={image} alt="" className="h-full w-full object-contain" /> : kind === "category" ? <FiTag size={20} /> : <FiLayers size={20} />}</span><div className="min-w-0"><h3 className="break-words text-sm font-semibold leading-6 text-slate-900">{name}</h3><p className="mt-1 break-words text-xs text-slate-500">{"variant_name" in entity ? entity.variant_name : kind === "category" ? "Service category" : "Service"}</p></div></div>
        {description && <p className="line-clamp-3 text-sm leading-6 text-slate-500" title={description}>{description}</p>}
        {"price" in entity && <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2"><span className="text-sm font-semibold text-slate-900">{Number(entity.price).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</span>{"estimated_days" in entity && entity.estimated_days != null && <span className="text-xs text-slate-500">{entity.estimated_days} days estimated</span>}</div>}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3"><button onClick={() => edit(kind, entity)} className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-[#852BAF] hover:bg-purple-50"><FiEdit2 size={14} /> Edit</button><button onClick={() => void remove(kind, entity)} className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${name}`}><FiTrash2 size={14} /> Remove</button></div>
    </article>;
  })}</div>;
}

function Editor({ kind, entity, saving, close, submit }: { kind: Kind; entity: Entity | null; saving: boolean; close: () => void; submit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  const category = kind === "category" ? entity as Category | null : null; const service = kind === "service" ? entity as Service | null : null; const variant = kind === "variant" ? entity as Variant | null : null;
  return <div className="fixed inset-0 z-[1000] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && close()}><div role="dialog" aria-modal="true" aria-label={`${entity ? "Edit" : "Add"} ${kind}`} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-2xl"><div className="flex items-center justify-between bg-gradient-to-r from-[#25103d] to-[#852BAF] px-6 py-5 text-white"><div><p className="text-[10px] font-bold uppercase tracking-wider text-purple-200">Catalogue editor</p><h2 className="text-xl font-black">{entity ? "Edit" : "Add"} {kind}</h2></div><button type="button" aria-label="Close editor" onClick={close} className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 hover:bg-white/20"><FiX /></button></div><form onSubmit={submit} className="grid gap-4 p-6 sm:grid-cols-2">
    {kind === "category" && <><Field label="Category name" name="name" value={category?.name} /><File label="Category icon" name="icon" /></>}
    {kind === "service" && <><Field label="Service name" name="name" value={service?.name} wide /><Field label="Starting price" name="price" type="number" value={service?.price} /><Field label="Estimated days" name="estimated_days" type="number" value={service?.estimated_days} /><Field label="Description" name="description" value={service?.description} wide area /><File label="Service image" name="service_image" wide /></>}
    {kind === "variant" && <><Field label="Variant name" name="variant_name" value={variant?.variant_name} /><Field label="Display title" name="title" value={variant?.title} /><Field label="Price" name="price" type="number" value={variant?.price} /><File label="Variant image" name="service_variant_image" /><Field label="Short description" name="short_description" value={variant?.short_description} wide area /></>}
    <div className="flex justify-end gap-3 pt-2 sm:col-span-2"><button type="button" onClick={close} className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600">Cancel</button><button disabled={saving} className="rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-5 py-3 text-sm font-extrabold text-white shadow disabled:opacity-50">{saving ? "Saving..." : entity ? "Save changes" : `Create ${kind}`}</button></div>
  </form></div></div>;
}
function Field({ label, name, value, type = "text", wide, area }: { label: string; name: string; value?: string | number; type?: string; wide?: boolean; area?: boolean }) { return <label className={`text-xs font-bold text-slate-500 ${wide ? "sm:col-span-2" : ""}`}>{label}{area ? <textarea name={name} required defaultValue={value} className={`${input} min-h-24`} /> : <input name={name} required type={type} min={type === "number" ? 0 : undefined} step={type === "number" ? "0.01" : undefined} defaultValue={value} className={input} />}</label>; }
function File({ label, name, wide }: { label: string; name: string; wide?: boolean }) { return <label className={`text-xs font-bold text-slate-500 ${wide ? "sm:col-span-2" : ""}`}>{label}<input name={name} type="file" accept="image/*" className={input} /><span className="mt-1 block text-[10px] font-medium text-slate-400">Optional when editing</span></label>; }
