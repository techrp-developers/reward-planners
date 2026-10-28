import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FiAlertTriangle, FiImage, FiPlus, FiRefreshCw, FiSearch, FiTrash2, FiUpload } from "react-icons/fi";
import { notificationApi, type CatalogOption } from "../notificationApi";
import type { CatalogProduct, ContentType, Language, ManagerMeta, MediaAsset, MediaMap, MediaSlot } from "../notificationTypes";
import { Card, EmptyState, Modal, Notice, Spinner, Tag, dangerBtn, inputCls, labelCls, primaryBtn, secondaryBtn } from "../components";
import { LANGUAGE_LABELS, apiErrorMessage } from "../notificationUtils";

export interface MediaDestinationValue {
  content_type: ContentType;
  destination_type: string;
  destination_id: string;
  catalog_product_ids: number[];
  media: MediaMap;
}

interface Props {
  meta: ManagerMeta;
  editable: boolean;
  module: string; // module option value
  value: MediaDestinationValue;
  onChange: (patch: Partial<MediaDestinationValue>) => void;
  assets: Record<number, MediaAsset>;
  onAssets: (assets: MediaAsset[]) => void;
  approvedLanguages: Language[];
  hasHindi: boolean;
  hasMarathi: boolean;
}

const SLOT_LABELS: Record<MediaSlot, string> = { default: "Default image (all languages)", en: "English image", hi: "Hindi image", mr: "Marathi image" };
const formatPrice = (value: number | null) => (value == null ? "—" : `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);

export default function MediaDestinationSection({ meta, editable, module, value, onChange, assets, onAssets, approvedLanguages, hasHindi, hasMarathi }: Props) {
  const mediaReady = meta.infrastructure.mediaTables;
  const backendModule = meta.modules.find((option) => option.value === module)?.module || "common";
  const destinations = meta.destinations.filter((item) => item.campaignAllowed && (item.module === backendModule || item.module === "common"));
  const destination = meta.destinations.find((item) => item.key === value.destination_type) || null;
  const [pickerSlot, setPickerSlot] = useState<MediaSlot | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Server-side language/image consistency check (e.g. English-text banner on Marathi text).
  const mediaKey = JSON.stringify([value.media, value.content_type, approvedLanguages, hasHindi, hasMarathi]);
  useEffect(() => {
    if (!mediaReady || value.content_type === "standard" || !Object.keys(value.media).length) { setWarnings([]); return undefined; }
    const timer = window.setTimeout(() => {
      notificationApi.previewMedia({
        media: value.media, content_type: value.content_type, approved_languages: approvedLanguages,
        title_hi: hasHindi ? "x" : "", title_mr: hasMarathi ? "x" : "",
      }).then((result) => {
        setWarnings(result.warnings);
        onAssets(Object.values(result.perLanguage).filter((asset): asset is MediaAsset => Boolean(asset)));
      }).catch(() => setWarnings([]));
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaKey]);

  const setContentType = (contentType: ContentType) => {
    if (contentType === "catalog" && backendModule !== "ecommerce") {
      toast.error("Product catalog notifications use the Products & E-commerce module. Change the module first.");
      return;
    }
    onChange({
      content_type: contentType,
      media: contentType === "standard" ? {} : value.media,
      catalog_product_ids: contentType === "catalog" ? value.catalog_product_ids : [],
      destination_type: contentType === "catalog" ? "" : value.destination_type === "product_collection" ? "" : value.destination_type,
    });
  };

  const slots: MediaSlot[] = ["default", "en", ...(hasHindi ? ["hi" as const] : []), ...(hasMarathi ? ["mr" as const] : [])];

  return (
    <Card title="Media & Destination" subtitle="What the notification shows and where it opens in the app">
      <div className="space-y-5 p-5">
        <div>
          <span className={labelCls}>Notification content type</span>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ["standard", "Standard", "Title and message"],
              ["image", "Image", "Title, message and one image"],
              ["catalog", "Product catalog", "Selected products, one cover image"],
            ] as [ContentType, string, string][]).map(([type, label, hint]) => (
              <button key={type} type="button" disabled={!editable || (!mediaReady && type !== "standard")} onClick={() => setContentType(type)}
                className={`rounded-xl border p-3 text-left transition disabled:opacity-50 ${value.content_type === type ? "border-[#852BAF] bg-purple-50" : "border-gray-200 hover:border-purple-200"}`}>
                <p className="text-sm font-bold text-gray-900">{label}</p>
                <p className="mt-0.5 text-xs text-gray-500">{hint}</p>
              </button>
            ))}
          </div>
          {!mediaReady && <p className="mt-2 text-xs text-amber-700">Image and catalog notifications need migration 20261028_01 (notification media library).</p>}
        </div>

        {value.content_type === "catalog" && (
          <CatalogPicker editable={editable} selected={value.catalog_product_ids} onChange={(ids) => onChange({ catalog_product_ids: ids })}
            onUseImage={async (product) => {
              try {
                const asset = await notificationApi.importMedia({ source: "product", id: product.product_id, label: product.product_name });
                onAssets([asset]);
                onChange({ media: { ...value.media, default: asset.media_id } });
                toast.success("Product image added as the cover image.");
              } catch (error) { toast.error(apiErrorMessage(error)); }
            }} />
        )}

        {value.content_type !== "standard" && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className={labelCls}>Images</span>
              <span className="text-[11px] text-gray-400">JPG/PNG/WebP, re-encoded to 1200×600 JPEG. Optional per-language images for banners with text.</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {slots.map((slot) => {
                const asset = value.media[slot] ? assets[value.media[slot] as number] : null;
                return (
                  <div key={slot} className="rounded-xl border border-gray-100 p-3">
                    <p className="mb-2 text-xs font-bold text-gray-600">{SLOT_LABELS[slot]}{slot === "default" && value.content_type !== "standard" ? " *" : ""}</p>
                    {value.media[slot] ? (
                      <div className="space-y-2">
                        {asset ? <img src={asset.public_url} alt="" className="aspect-[2/1] w-full rounded-lg border border-gray-100 object-cover" /> : <div className="flex aspect-[2/1] items-center justify-center rounded-lg bg-gray-50 text-xs text-gray-400">Image #{value.media[slot]}</div>}
                        {asset && <p className="truncate text-[11px] text-gray-500">{asset.label || asset.source} · {asset.language ? `${asset.language.toUpperCase()} text` : "language-neutral"} · {Math.round(asset.bytes / 1024)} KB</p>}
                        {editable && (
                          <div className="flex gap-2">
                            <button type="button" className={secondaryBtn} onClick={() => setPickerSlot(slot)}><FiRefreshCw /> Replace</button>
                            <button type="button" className={dangerBtn} onClick={() => { const next = { ...value.media }; delete next[slot]; onChange({ media: next }); }}><FiTrash2 /> Remove</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button type="button" disabled={!editable} onClick={() => setPickerSlot(slot)}
                        className="flex aspect-[2/1] w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-200 text-sm font-semibold text-gray-500 hover:border-[#852BAF] hover:text-[#852BAF] disabled:opacity-50">
                        <FiImage className="text-xl" /> Choose image
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {warnings.map((warning) => <Notice key={warning}><span className="inline-flex items-start gap-2"><FiAlertTriangle className="mt-0.5 shrink-0" /> {warning}</span></Notice>)}
            <p className="text-xs text-gray-500">If an image can't be loaded when the notification is sent, employees still get the title and message.</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className={labelCls}>Destination (opens on tap)</span>
            <select className={inputCls} disabled={!editable || value.content_type === "catalog"} value={value.content_type === "catalog" ? (value.catalog_product_ids.length === 1 ? "product" : "product_collection") : value.destination_type}
              onChange={(event) => onChange({ destination_type: event.target.value, destination_id: "" })}>
              {value.content_type === "catalog"
                ? <option value={value.catalog_product_ids.length === 1 ? "product" : "product_collection"}>{value.catalog_product_ids.length === 1 ? "Product details" : "Selected products (collection)"}</option>
                : <>
                  <option value="">Module default screen</option>
                  {destinations.filter((item) => item.entity !== "product_list").map((item) => <option key={item.key} value={item.key}>{item.label}{item.mobileRoute === "proposed" ? " (app route pending)" : ""}</option>)}
                </>}
            </select>
          </label>
          {value.content_type !== "catalog" && destination?.entity && destination.entity !== "published_quiz" && (
            <EntityPicker entity={destination.entity} editable={editable} value={value.destination_id} onChange={(id) => onChange({ destination_id: id })} />
          )}
        </div>
        {(destination || value.content_type === "catalog") && (
          <p className="text-xs text-gray-500">
            {(destination?.mobileRoute === "proposed" || value.content_type === "catalog")
              ? "This screen still has to be registered in the mobile app. Until then the app opens the module's home screen or the inbox."
              : "Opens this screen in Reward Planners. If the item is no longer available, the app falls back to the inbox."}
            {destination?.entity === "published_quiz" && " Only offered while a quiz is published."}
          </p>
        )}
      </div>

      {pickerSlot && (
        <MediaPicker slot={pickerSlot} onClose={() => setPickerSlot(null)} onPick={(asset) => {
          onAssets([asset]);
          onChange({ media: { ...value.media, [pickerSlot]: asset.media_id } });
          setPickerSlot(null);
        }} />
      )}
    </Card>
  );
}

function EntityPicker({ entity, editable, value, onChange }: { entity: string; editable: boolean; value: string; onChange: (id: string) => void }) {
  const [options, setOptions] = useState<{ id: number; label: string }[] | null>(null);
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<CatalogProduct[]>([]);

  useEffect(() => {
    const kinds: Record<string, "categories" | "services" | "service-categories"> = { category: "categories", service: "services", service_category: "service-categories" };
    const kind = kinds[entity];
    if (!kind) return;
    notificationApi.catalogOptions(kind).then((rows: CatalogOption[]) => setOptions(rows.map((row) => ({
      id: Number(row.service_id ?? row.category_id),
      label: String(row.name ?? row.category_name ?? ""),
    })))).catch(() => setOptions([]));
  }, [entity]);

  useEffect(() => {
    if (entity !== "product" || search.trim().length < 2) return undefined;
    const timer = window.setTimeout(() => notificationApi.catalogProducts({ search: search.trim() }).then(setProducts).catch(() => setProducts([])), 300);
    return () => window.clearTimeout(timer);
  }, [entity, search]);

  if (entity === "product") {
    return (
      <div>
        <span className={labelCls}>Product *</span>
        {value && <p className="mb-1 text-xs font-semibold text-[#852BAF]">Selected product #{value}</p>}
        <input className={inputCls} disabled={!editable} placeholder="Search listed products" value={search} onChange={(event) => setSearch(event.target.value)} />
        {products.length > 0 && search.trim().length >= 2 && (
          <div className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-gray-100">
            {products.map((product) => (
              <button key={product.product_id} type="button" disabled={!product.available} onClick={() => { onChange(String(product.product_id)); setSearch(""); }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-purple-50 disabled:opacity-40">
                <span className="truncate">{product.product_name}</span><span className="shrink-0 text-xs text-gray-500">{product.available ? formatPrice(product.price_from) : "unavailable"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <label><span className={labelCls}>{entity === "category" ? "Product category" : entity === "service" ? "Service" : "Service category"} *</span>
      <select className={inputCls} disabled={!editable || !options} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{options ? "Select…" : "Loading…"}</option>
        {options?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </select>
    </label>
  );
}

function CatalogPicker({ editable, selected, onChange, onUseImage }: { editable: boolean; selected: number[]; onChange: (ids: number[]) => void; onUseImage: (product: CatalogProduct) => void }) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<CatalogProduct[]>([]);

  // Always show the selection with live prices/stock from the shop.
  const selectedKey = selected.join(",");
  useEffect(() => {
    if (!selected.length) { setSelectedProducts([]); return; }
    notificationApi.catalogProducts({ ids: selectedKey }).then(setSelectedProducts).catch(() => setSelectedProducts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => notificationApi.catalogProducts({ search: search.trim() }).then(setResults).catch(() => setResults([])), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const missing = selected.filter((id) => !selectedProducts.some((product) => product.product_id === id));

  return (
    <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-extrabold uppercase tracking-wider text-gray-500">Products ({selected.length}/20)</span>
        <span className="text-[11px] text-gray-400">{selected.length === 1 ? "Opens the product page" : selected.length > 1 ? "Opens a collection of these products" : ""}</span>
      </div>
      {selectedProducts.length > 0 && (
        <div className="space-y-1.5">
          {selectedProducts.map((product) => (
            <div key={product.product_id} className="flex items-center gap-3 rounded-lg bg-white p-2">
              {product.image_url ? <img src={product.image_url} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="h-10 w-10 rounded bg-gray-100" />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">{product.product_name}</p>
                <p className="text-xs text-gray-500">{formatPrice(product.price_from)}{product.mrp_from && product.price_from && product.mrp_from > product.price_from ? ` · MRP ${formatPrice(product.mrp_from)}` : ""} · {product.available ? `${product.stock} in stock` : <span className="font-semibold text-red-600">unavailable</span>}</p>
              </div>
              {editable && <button type="button" className="text-xs font-bold text-[#852BAF] hover:underline" onClick={() => onUseImage(product)}>Use image</button>}
              {editable && <button type="button" aria-label="Remove product" className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" onClick={() => onChange(selected.filter((id) => id !== product.product_id))}><FiTrash2 /></button>}
            </div>
          ))}
        </div>
      )}
      {missing.length > 0 && <Notice tone="red">No longer listed in the shop: #{missing.join(", #")}. Remove them before saving.</Notice>}
      {editable && selected.length < 20 && (
        <div>
          <div className="relative"><FiSearch className="absolute left-3 top-2.5 text-gray-400" />
            <input className={`${inputCls} pl-9`} placeholder="Search listed products by name or brand" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="mt-2 grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {results.filter((product) => !selected.includes(product.product_id)).map((product) => (
              <button key={product.product_id} type="button" disabled={!product.available} onClick={() => onChange([...selected, product.product_id])}
                title={product.available ? "Add" : "Out of stock or no visible price"}
                className="flex items-center gap-2 rounded-lg bg-white p-2 text-left transition hover:ring-2 hover:ring-purple-100 disabled:opacity-40">
                {product.image_url ? <img src={product.image_url} alt="" className="h-9 w-9 rounded object-cover" /> : <span className="h-9 w-9 rounded bg-gray-100" />}
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-gray-800">{product.product_name}</span><span className="text-[11px] text-gray-500">{formatPrice(product.price_from)}</span></span>
                <FiPlus className="shrink-0 text-gray-400" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type PickerTab = "library" | "upload" | "product" | "service" | "service_banner" | "category";

function MediaPicker({ slot, onClose, onPick }: { slot: MediaSlot; onClose: () => void; onPick: (asset: MediaAsset) => void }) {
  const [tab, setTab] = useState<PickerTab>("library");
  const [textLanguage, setTextLanguage] = useState<Language | "">(slot === "default" ? "" : slot);
  const [busy, setBusy] = useState(false);

  const importFrom = async (source: Exclude<PickerTab, "library" | "upload">, id: number, label: string) => {
    setBusy(true);
    try {
      onPick(await notificationApi.importMedia({ source, id, label, ...(textLanguage ? { language: textLanguage } : {}) }));
      toast.success("Image added to the notification library.");
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Choose image · ${SLOT_LABELS[slot]}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1">
            {([["library", "Library"], ["upload", "Upload"], ["product", "Product"], ["service", "Service"], ["service_banner", "Service banner"], ["category", "Category"]] as [PickerTab, string][]).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${tab === key ? "bg-white text-[#852BAF] shadow-sm" : "text-gray-500"}`}>{label}</button>
            ))}
          </div>
          {tab !== "library" && (
            <label className="w-56"><span className={labelCls}>Text inside the image</span>
              <select className={inputCls} value={textLanguage} onChange={(event) => setTextLanguage(event.target.value as Language | "")}>
                <option value="">None / language-neutral</option>
                {(["en", "hi", "mr"] as Language[]).map((lang) => <option key={lang} value={lang}>{LANGUAGE_LABELS[lang]}</option>)}
              </select>
            </label>
          )}
        </div>
        {busy && <Spinner />}
        {!busy && tab === "library" && <LibraryGrid onPick={onPick} />}
        {!busy && tab === "upload" && <UploadPanel language={textLanguage} onUploaded={onPick} />}
        {!busy && tab === "product" && <ProductImageGrid onPick={(product) => importFrom("product", product.product_id, product.product_name)} />}
        {!busy && tab !== "library" && tab !== "upload" && tab !== "product" && <CatalogImageGrid kind={tab} onPick={(id, label) => importFrom(tab, id, label)} />}
        <p className="text-[11px] text-gray-500">Images are copied into the notification library and re-encoded on our servers. Only catalog assets and uploads from this dashboard can be used; external links are not accepted.</p>
      </div>
    </Modal>
  );
}

function LibraryGrid({ onPick }: { onPick: (asset: MediaAsset) => void }) {
  const [rows, setRows] = useState<MediaAsset[] | null>(null);
  useEffect(() => { notificationApi.media({ limit: 48 }).then((result) => setRows(result.rows)).catch(() => setRows([])); }, []);
  if (!rows) return <Spinner />;
  if (!rows.length) return <EmptyState title="The library is empty" text="Upload an image or pick one from a product, service or banner." />;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {rows.map((asset) => (
        <button key={asset.media_id} type="button" onClick={() => onPick(asset)} className="overflow-hidden rounded-xl border border-gray-100 text-left hover:ring-2 hover:ring-purple-200">
          <img src={asset.public_url} alt="" className="aspect-[2/1] w-full object-cover" />
          <div className="p-2"><p className="truncate text-xs font-semibold text-gray-800">{asset.label || `Image #${asset.media_id}`}</p><div className="mt-1 flex gap-1"><Tag>{asset.source.replace("_", " ")}</Tag>{asset.language ? <Tag tone="amber">{asset.language.toUpperCase()} text</Tag> : <Tag tone="green">neutral</Tag>}</div></div>
        </button>
      ))}
    </div>
  );
}

function UploadPanel({ language, onUploaded }: { language: Language | ""; onUploaded: (asset: MediaAsset) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!file) { setPreview(null); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const choose = (next: File | undefined) => {
    if (!next) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(next.type)) { toast.error("Use a JPG, PNG or WebP image."); return; }
    if (next.size > 5 * 1024 * 1024) { toast.error("Images must be 5 MB or smaller."); return; }
    setFile(next);
    setLabel(next.name.replace(/\.[^.]+$/, ""));
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex aspect-[2/1] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-[#852BAF]">
        {preview ? <img src={preview} alt="" className="h-full w-full rounded-xl object-contain" /> : <><FiUpload className="text-2xl" /> Choose JPG, PNG or WebP (max 5 MB)<span className="text-[11px]">Recommended 1200×600</span></>}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => choose(event.target.files?.[0])} />
      </label>
      <div className="space-y-3">
        <label className="block"><span className={labelCls}>Label</span><input className={inputCls} maxLength={150} value={label} onChange={(event) => setLabel(event.target.value)} /></label>
        <p className="text-xs text-gray-500">Do not upload customer documents, ID proofs, bills or payment screenshots. Images are visible on lock screens.</p>
        <button type="button" className={primaryBtn} disabled={!file || uploading} onClick={async () => {
          if (!file) return;
          setUploading(true);
          try { onUploaded(await notificationApi.uploadMedia(file, language, label)); toast.success("Image uploaded."); }
          catch (error) { toast.error(apiErrorMessage(error)); }
          finally { setUploading(false); }
        }}><FiUpload /> {uploading ? "Uploading…" : "Upload and use"}</button>
      </div>
    </div>
  );
}

function ProductImageGrid({ onPick }: { onPick: (product: CatalogProduct) => void }) {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<CatalogProduct[] | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => notificationApi.catalogProducts({ search: search.trim() }).then(setRows).catch(() => setRows([])), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  return (
    <div className="space-y-3">
      <input className={inputCls} placeholder="Search listed products" value={search} onChange={(event) => setSearch(event.target.value)} />
      {!rows ? <Spinner /> : !rows.length ? <EmptyState title="No listed products found" /> : (
        <div className="grid gap-3 sm:grid-cols-4">
          {rows.filter((product) => product.image_url).map((product) => (
            <button key={product.product_id} type="button" onClick={() => onPick(product)} className="overflow-hidden rounded-xl border border-gray-100 text-left hover:ring-2 hover:ring-purple-200">
              <img src={product.image_url as string} alt="" className="aspect-square w-full object-cover" />
              <p className="truncate p-2 text-xs font-semibold text-gray-800">{product.product_name}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CatalogImageGrid({ kind, onPick }: { kind: "service" | "service_banner" | "category"; onPick: (id: number, label: string) => void }) {
  const [rows, setRows] = useState<CatalogOption[] | null>(null);
  useEffect(() => {
    const source = kind === "service" ? "services" : kind === "service_banner" ? "service-banners" : "categories";
    notificationApi.catalogOptions(source).then(setRows).catch(() => setRows([]));
  }, [kind]);
  if (!rows) return <Spinner />;
  const items = rows.map((row) => ({
    id: Number(row.service_id ?? row.banner_id ?? row.category_id),
    label: String(row.name ?? row.title ?? row.category_name ?? ""),
    image: row.service_image ?? row.image_url ?? row.cover_image ?? null,
  })).filter((item) => item.image);
  if (!items.length) return <EmptyState title="No images available here" />;
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <button key={item.id} type="button" onClick={() => onPick(item.id, item.label)} className="overflow-hidden rounded-xl border border-gray-100 text-left hover:ring-2 hover:ring-purple-200">
          <img src={item.image as string} alt="" className="aspect-[2/1] w-full bg-gray-50 object-contain" />
          <p className="truncate p-2 text-xs font-semibold text-gray-800">{item.label}</p>
        </button>
      ))}
    </div>
  );
}
