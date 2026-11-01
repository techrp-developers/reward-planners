import { useEffect, useState } from "react";
import { FiArrowLeft, FiImage, FiSave } from "react-icons/fi";
import axios from "axios";
import { Link, useNavigate, useParams } from "react-router-dom";
import Swal from "sweetalert2";
import { api } from "../../../../common/api/api";
import { routes } from "../../../../routes";
import ContentTargetSelector from "../../content_manager/component/ContentTargetSelector";
import type { ContentTargetType } from "../../content_manager/types";
import { POSTER_PLACEMENTS, placementDetails, placementOf, type PosterPlacement } from "./posterPlacement";

type Status = "draft" | "active" | "archived";
type LinkKind = "none" | "catalogue" | "flash_sale" | "external_url" | "brand";
interface FlashSale { campaign_id: number; title: string; }

const fieldClass = "w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100";
const toLocalInput = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const linkKindOf = (redirectType: string | null): LinkKind => {
  if (!redirectType) return "none";
  if (redirectType === "campaign") return "flash_sale";
  if (redirectType === "external_url" || redirectType === "brand") return redirectType;
  return "catalogue";
};

export default function PosterEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);

  const [title, setTitle] = useState("");
  const [placement, setPlacement] = useState<PosterPlacement>("ecommerce");
  const [status, setStatus] = useState<Status>("draft");
  const [displayOrder, setDisplayOrder] = useState("0");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [banner, setBanner] = useState<File | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [linkKind, setLinkKind] = useState<LinkKind>("none");
  const [targetType, setTargetType] = useState<ContentTargetType | "">("");
  const [targetId, setTargetId] = useState<number | null>(null);
  const [targetIds, setTargetIds] = useState<number[]>([]);
  const [flashSaleId, setFlashSaleId] = useState("");
  const [url, setUrl] = useState("");
  const [brandId, setBrandId] = useState<number | null>(null);
  const [flashSales, setFlashSales] = useState<FlashSale[]>([]);
  const [saving, setSaving] = useState(false);

  const details = placementDetails(placement);

  useEffect(() => {
    api.get("/campaign/campaigns", { params: { campaign_type: "flash_sale", status: "active" } })
      .then((response) => setFlashSales(response.data?.data || []))
      .catch(() => setFlashSales([]));
  }, []);

  useEffect(() => {
    if (!id) return;
    api.get(`/campaign/campaigns/${id}`).then((response) => {
      const poster = response.data.data;
      setTitle(poster.title || "");
      setPlacement(placementOf(poster.campaign_type, poster.module));
      setStatus(poster.status);
      setDisplayOrder(String(poster.display_order ?? 0));
      setStartAt(toLocalInput(poster.start_at));
      setEndAt(toLocalInput(poster.end_at));
      setBannerUrl(poster.banner_image || null);
      const kind = linkKindOf(poster.redirect_type);
      setLinkKind(kind);
      if (kind === "catalogue") {
        setTargetType(poster.redirect_type);
        setTargetId(poster.redirect_id);
        setTargetIds(poster.redirect_ids || []);
      }
      if (kind === "flash_sale") setFlashSaleId(String(poster.redirect_id ?? ""));
      if (kind === "external_url") setUrl(poster.redirect_url || "");
      if (kind === "brand") setBrandId(poster.redirect_id);
    }).catch(() => void Swal.fire("Unable to load poster", "Please try again.", "error"));
  }, [id]);

  const clearCatalogueTarget = () => { setTargetType(""); setTargetId(null); setTargetIds([]); };

  const changePlacement = (next: PosterPlacement) => {
    setPlacement(next);
    clearCatalogueTarget();
  };

  const destinationIsComplete = () => {
    if (linkKind === "catalogue") return Boolean(targetType) && Boolean(targetIds.length || targetId);
    if (linkKind === "flash_sale") return Boolean(flashSaleId);
    if (linkKind === "external_url") return /^https?:\/\//i.test(url.trim());
    return true;
  };

  const redirectFields = (): Record<string, string> => {
    if (linkKind === "catalogue") return { redirect_type: targetType, redirect_id: String(targetIds[0] ?? targetId ?? ""), redirect_ids: JSON.stringify(targetIds), redirect_url: "" };
    if (linkKind === "flash_sale") return { redirect_type: "campaign", redirect_id: flashSaleId, redirect_ids: "", redirect_url: "" };
    if (linkKind === "external_url") return { redirect_type: "external_url", redirect_id: "", redirect_ids: "", redirect_url: url.trim() };
    if (linkKind === "brand") return { redirect_type: "brand", redirect_id: String(brandId ?? ""), redirect_ids: "", redirect_url: "" };
    return { redirect_type: "", redirect_id: "", redirect_ids: "", redirect_url: "" };
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing && !banner) return void Swal.fire("Poster image required", "Upload the poster image first.", "warning");
    if (startAt && endAt && new Date(startAt) >= new Date(endAt)) return void Swal.fire("Invalid schedule", "End time must be after start time.", "warning");
    if (!destinationIsComplete()) return void Swal.fire("Destination incomplete", "Choose what this poster should open.", "warning");

    const data = new FormData();
    data.set("title", title);
    data.set("campaign_type", details.campaignType);
    data.set("module", details.module);
    data.set("status", status);
    data.set("display_order", displayOrder);
    data.set("start_at", startAt);
    data.set("end_at", endAt);
    Object.entries(redirectFields()).forEach(([key, value]) => data.set(key, value));
    if (banner) data.append("banner_image", banner);

    try {
      setSaving(true);
      if (editing) await api.put(`/campaign/campaigns/${id}`, data);
      else await api.post("/campaign/campaigns", data);
      await Swal.fire({ icon: "success", title: editing ? "Poster updated" : "Poster created", timer: 1200, showConfirmButton: false });
      navigate(routes.manager.posters.list);
    } catch (error: unknown) {
      const message = axios.isAxiosError(error) ? error.response?.data?.message : null;
      await Swal.fire("Unable to save", message || "Please check the poster details.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link to={routes.manager.posters.list} className="inline-flex items-center gap-2 text-sm font-bold text-[#852BAF]"><FiArrowLeft /> Back to posters</Link>
      <form onSubmit={submit} className="overflow-hidden rounded-3xl border border-purple-100 bg-white shadow-[0_18px_55px_rgba(67,31,91,0.08)]">
        <div className="bg-gradient-to-r from-[#25103d] to-[#852BAF] px-7 py-6 text-white">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-200">{editing ? "Poster workspace" : "New poster"}</p>
          <h1 className="mt-1 text-2xl font-black">{editing ? "Edit Poster" : "Create Poster"}</h1>
        </div>
        <div className="grid gap-5 p-7 md:grid-cols-2">
          <label className="md:col-span-2">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-500">Poster title *</span>
            <input required value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} />
          </label>
          <label>
            <span className="mb-2 block text-xs font-bold text-gray-500">Show on *</span>
            <select value={placement} onChange={(event) => changePlacement(event.target.value as PosterPlacement)} className={fieldClass}>
              {POSTER_PLACEMENTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-2 block text-xs font-bold text-gray-500">Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as Status)} className={fieldClass}>
              <option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option>
            </select>
          </label>
          <label>
            <span className="mb-2 block text-xs font-bold text-gray-500">Starts at <span className="font-normal text-gray-400">(optional)</span></span>
            <input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} className={fieldClass} />
          </label>
          <label>
            <span className="mb-2 block text-xs font-bold text-gray-500">Ends at <span className="font-normal text-gray-400">(optional)</span></span>
            <input type="datetime-local" value={endAt} min={startAt || undefined} onChange={(event) => setEndAt(event.target.value)} className={fieldClass} />
          </label>
          <label>
            <span className="mb-2 block text-xs font-bold text-gray-500">Display order</span>
            <input type="number" min="0" value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} className={fieldClass} />
          </label>
          <label>
            <span className="mb-2 block text-xs font-bold text-gray-500">When tapped, open</span>
            <select value={linkKind} onChange={(event) => { setLinkKind(event.target.value as LinkKind); clearCatalogueTarget(); }} className={fieldClass}>
              <option value="none">Nothing</option>
              <option value="catalogue">{placement === "service" ? "Services, a category, or a bundle" : placement === "ecommerce" ? "Products, a category, or a subcategory" : "Products, services, or a category"}</option>
              <option value="flash_sale">A flash sale</option>
              <option value="external_url">An external link</option>
              {linkKind === "brand" && <option value="brand">Brand #{brandId} (existing)</option>}
            </select>
          </label>
          {linkKind === "catalogue" && (
            <ContentTargetSelector
              module={details.selectorModule}
              multiple
              title="Poster destination"
              description="Pick one item to open its page, several to open a curated list, or a whole category."
              targetType={targetType}
              targetId={targetId}
              targetIds={targetIds}
              onChange={(nextType, nextId, nextIds = nextId ? [nextId] : []) => { setTargetType(nextType); setTargetId(nextId); setTargetIds(nextIds); }}
            />
          )}
          {linkKind === "flash_sale" && (
            <label className="md:col-span-2">
              <span className="mb-2 block text-xs font-bold text-gray-500">Flash sale *</span>
              <select required value={flashSaleId} onChange={(event) => setFlashSaleId(event.target.value)} className={fieldClass}>
                <option value="">Choose a flash sale</option>
                {flashSales.map((sale) => <option key={sale.campaign_id} value={sale.campaign_id}>{sale.title}</option>)}
              </select>
            </label>
          )}
          {linkKind === "external_url" && (
            <label className="md:col-span-2">
              <span className="mb-2 block text-xs font-bold text-gray-500">Link *</span>
              <input required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." className={fieldClass} />
            </label>
          )}
          <label className="md:col-span-2">
            <span className="mb-2 block text-xs font-bold text-gray-500">Poster image {!editing && "*"}</span>
            <div className="flex items-center gap-4 rounded-2xl border border-dashed border-purple-200 bg-purple-50/40 p-4">
              {banner ? <img src={URL.createObjectURL(banner)} className="h-20 w-36 rounded-xl object-cover" alt="Selected poster" /> : bannerUrl ? <img src={bannerUrl} className="h-20 w-36 rounded-xl object-cover" alt="Current poster" /> : <span className="grid h-20 w-36 place-items-center rounded-xl bg-white text-[#852BAF]"><FiImage size={25} /></span>}
              <input type="file" accept="image/*" onChange={(event) => setBanner(event.target.files?.[0] || null)} className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-purple-100 file:px-3 file:py-2 file:font-bold file:text-[#852BAF]" />
            </div>
          </label>
        </div>
        <div className="flex justify-end border-t border-gray-100 px-7 py-5">
          <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-6 py-3 text-sm font-extrabold text-white shadow-lg disabled:opacity-50"><FiSave /> {saving ? "Saving..." : editing ? "Save Poster" : "Create Poster"}</button>
        </div>
      </form>
    </div>
  );
}
