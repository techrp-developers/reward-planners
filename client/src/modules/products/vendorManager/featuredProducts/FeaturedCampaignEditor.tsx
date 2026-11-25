import { Fragment, useEffect, useState } from "react";
import {
  FiArrowDown,
  FiArrowLeft,
  FiArrowUp,
  FiCheck,
  FiImage,
  FiSave,
  FiSearch,
  FiStar,
  FiTrash2,
} from "react-icons/fi";
import axios from "axios";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Swal from "sweetalert2";
import { api } from "../../../../common/api/api";
import { routes } from "../../../../routes";

type Status = "draft" | "active" | "archived";
type BackgroundType = "solid" | "gradient" | "image";
interface CampaignForm {
  title: string;
  background_type: BackgroundType;
  background_color: string;
  gradient_end_color: string;
  text_color: string;
  cta_text: string;
  start_at: string;
  end_at: string;
  display_order: string;
  status: Status;
}
interface ProductOption {
  product_id: number;
  product_name: string;
  brand_name: string | null;
  category_name: string | null;
  variant_id?: number | null;
  sale_price: number | null;
  mrp: number | null;
  stock?: number | null;
  image_url: string | null;
  is_eligible?: boolean;
  reward?: { enabled?: boolean; coins?: number; label?: string | null };
}

interface ImageMetadata {
  width: number;
  height: number;
  aspectRatio: string;
  size: number | null;
  format: string;
  mimeType?: string;
}

const blankForm: CampaignForm = {
  title: "",
  background_type: "gradient",
  background_color: "#4B0082",
  gradient_end_color: "#6A00FF",
  text_color: "#FFFFFF",
  cta_text: "Explore More",
  start_at: "",
  end_at: "",
  display_order: "0",
  status: "draft",
};

const toLocalInput = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

const fieldClass = "w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100";
const imageTypes = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const RECOMMENDED_IMAGE_SIZE = 800 * 1024;
const safeColor = (value: string, fallback: string) =>
  /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallback;
const relativeLuminance = (hex: string) => {
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
const hasReadableTextContrast = (textColor: string, backgroundColor: string) => {
  const textLuminance = relativeLuminance(safeColor(textColor, "#FFFFFF"));
  const backgroundLuminance = relativeLuminance(safeColor(backgroundColor, "#4B0082"));
  const lighter = Math.max(textLuminance, backgroundLuminance);
  const darker = Math.min(textLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05) >= 4.5;
};
const errorMessage = (error: unknown) => axios.isAxiosError(error)
  ? error.response?.data?.message || error.message
  : "Please try again.";

const readImageDimensions = (source: string) => new Promise<{ width: number; height: number }>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
  image.onerror = () => reject(new Error("This image could not be decoded. Try exporting it as JPG, PNG, or WebP."));
  image.src = source;
});

const readFileHeader = (file: File) => new Promise<Uint8Array>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    if (!(reader.result instanceof ArrayBuffer)) {
      reject(new Error("The selected image could not be read."));
      return;
    }
    resolve(new Uint8Array(reader.result));
  };
  reader.onerror = () => reject(new Error("The selected image could not be read."));
  reader.readAsArrayBuffer(file.slice(0, 12));
});

const aspectRatioLabel = (width: number, height: number) => {
  const ratio = width / height;
  const knownRatios: Array<[number, string]> = [
    [4 / 5, "4:5"], [1, "1:1"], [3 / 4, "3:4"], [2 / 3, "2:3"],
    [16 / 9, "16:9"], [3 / 2, "3:2"], [2, "2:1"],
  ];
  return knownRatios.find(([value]) => Math.abs(value - ratio) / value <= 0.02)?.[1]
    ?? `${ratio.toFixed(2)}:1`;
};

const inspectImageFile = async (file: File): Promise<ImageMetadata> => {
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error("Choose an image no larger than 5 MB.");
  }
  const header = await readFileHeader(file);
  const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const isPng = [0x89, 0x50, 0x4e, 0x47].every((value, index) => header[index] === value);
  const isWebp = String.fromCharCode(...header.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...header.slice(8, 12)) === "WEBP";
  const format = isJpeg ? "JPG" : isPng ? "PNG" : isWebp ? "WebP" : null;
  const mimeType = isJpeg ? "image/jpeg" : isPng ? "image/png" : isWebp ? "image/webp" : null;
  if (!format || !mimeType || (file.type && (!imageTypes.includes(file.type) || file.type !== mimeType))) {
    throw new Error("Choose a valid JPG, PNG, or WebP image.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const dimensions = await readImageDimensions(objectUrl);
    if (!dimensions.width || !dimensions.height) {
      throw new Error("This image has no readable pixel dimensions.");
    }
    return {
      ...dimensions,
      aspectRatio: aspectRatioLabel(dimensions.width, dimensions.height),
      size: file.size,
      format,
      mimeType,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const formatFileSize = (bytes: number) => bytes < 1024
  ? `${bytes} B`
  : bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;

const ColorControl = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <label className="block">
    <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
    <div className="flex gap-2">
      <input
        aria-label={`${label} picker`}
        type="color"
        value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#4B0082"}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        className="h-11 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
      />
      <input
        aria-label={`${label} hex value`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${fieldClass} font-mono uppercase`}
        maxLength={7}
        spellCheck={false}
      />
    </div>
  </label>
);

function MobileCampaignPreview({
  form,
  imageUrl,
  products,
}: {
  form: CampaignForm;
  imageUrl: string | null;
  products: ProductOption[];
}) {
  const visibleProducts = products.slice(0, 10);
  const previewStyle: React.CSSProperties = {
    backgroundColor: safeColor(form.background_color, "#4B0082"),
    backgroundImage: form.background_type === "image" && imageUrl
      ? `url("${imageUrl}")`
      : form.background_type === "gradient"
        ? `linear-gradient(135deg, ${safeColor(form.background_color, "#4B0082")}, ${safeColor(form.gradient_end_color, "#6A00FF")})`
        : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
    color: safeColor(form.text_color, "#FFFFFF"),
  };
  const rows = [visibleProducts.slice(0, 5), visibleProducts.slice(5, 10)];

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="mb-4 flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-purple-50 text-[#852BAF]"><FiStar /></span>
      <div><h2 className="text-base font-semibold text-slate-900">Mobile preview</h2><p className="mt-1 text-xs leading-5 text-slate-500">Preview of how this campaign will appear in the Reward Planners app. Image cropping may vary by device.</p></div>
    </div>
    <div className="mx-auto w-full max-w-[360px] rounded-[30px] border-[7px] border-slate-900 bg-slate-900 p-1.5 shadow-xl">
      <div className="max-h-[620px] min-h-[440px] overflow-y-auto rounded-[22px] bg-white">
        <div className="relative min-h-[440px] overflow-hidden" style={previewStyle}>
          {form.background_type === "image" && imageUrl && <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/20" />}
          <div className="relative px-4 pb-4 pt-5">
            <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
              <h3 dir="auto" className="min-w-0 flex-1 text-lg font-bold leading-6" style={{ color: safeColor(form.text_color, "#FFFFFF") }}>{form.title.trim() || "Campaign heading"}</h3>
              <span dir="auto" className="inline-flex max-w-[45%] shrink-0 items-center gap-1 rounded-full bg-black/10 px-2.5 py-1.5 text-[11px] font-semibold" style={{ color: safeColor(form.text_color, "#FFFFFF") }}>
                <span className="truncate">{form.cta_text.trim() || "Explore More"}</span><span aria-hidden="true">→</span>
              </span>
            </div>
            {visibleProducts.length ? <div className="space-y-3">
              {rows.filter((row) => row.length > 0).map((row, rowIndex) => <div key={rowIndex} className="-mx-4 overflow-x-auto px-4 pb-1">
                <div className="flex w-max gap-3">
                  {row.map((product) => <div key={product.product_id} className="w-[132px] shrink-0 overflow-hidden rounded-xl bg-white p-2 text-slate-900 shadow-sm">
                    {product.image_url
                      ? <img src={product.image_url} alt="" className="h-[112px] w-full rounded-lg bg-slate-50 object-contain" />
                      : <div className="grid h-[112px] place-items-center rounded-lg bg-slate-50 text-slate-300"><FiImage /></div>}
                    <p className="mt-2 line-clamp-2 min-h-8 text-[11px] font-semibold">{product.product_name || `Product #${product.product_id}`}</p>
                    {product.sale_price !== null && product.sale_price !== undefined && Number.isFinite(Number(product.sale_price)) && <p className="mt-1 text-xs font-bold">₹{Number(product.sale_price).toFixed(2)}</p>}
                    {product.reward?.label && <p className="mt-1 line-clamp-1 text-[10px] text-emerald-700">{product.reward.label}</p>}
                  </div>)}
                </div>
              </div>)}
            </div> : <p className="rounded-xl bg-black/10 p-4 text-center text-sm">Selected products will appear here.</p>}
          </div>
        </div>
      </div>
    </div>
    <p className="mt-3 text-center text-xs text-slate-500">Home preview shows up to 10 products. Explore More lists all selected products.</p>
  </section>;
}

export default function FeaturedCampaignEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editing = Boolean(id);
  const previewOnly = searchParams.get("preview") === "1";
  const [form, setForm] = useState<CampaignForm>(blankForm);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [localBannerUrl, setLocalBannerUrl] = useState<string | null>(null);
  const [bannerMetadata, setBannerMetadata] = useState<ImageMetadata | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selected, setSelected] = useState<ProductOption[]>([]);
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(editing);
  const [searching, setSearching] = useState(false);
  const [savingCampaign, setSavingCampaign] = useState(false);
  const [savingProducts, setSavingProducts] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!bannerFile) {
      setLocalBannerUrl(null);
      return;
    }
    const url = URL.createObjectURL(bannerFile);
    setLocalBannerUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [bannerFile]);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    Promise.all([
      api.get(`/campaign/campaigns/${id}`),
      api.get(`/campaign/campaigns/${id}/featured-products`),
    ]).then(([campaignResponse, productsResponse]) => {
      if (!active) return;
      const campaign = campaignResponse.data?.data;
      setForm({
        title: campaign.title || "",
        background_type: campaign.background_type || "gradient",
        background_color: campaign.background_color || "#4B0082",
        gradient_end_color: campaign.gradient_end_color || "#6A00FF",
        text_color: campaign.text_color || "#FFFFFF",
        cta_text: campaign.cta_text || "Explore More",
        start_at: toLocalInput(campaign.start_at),
        end_at: toLocalInput(campaign.end_at),
        display_order: String(campaign.display_order ?? 0),
        status: campaign.status || "draft",
      });
      setBannerUrl(campaign.banner_image || null);
      setBannerMetadata(null);
      if (campaign.banner_image) {
        void readImageDimensions(campaign.banner_image)
          .then(({ width, height }) => {
            if (active) setBannerMetadata({
              width,
              height,
              aspectRatio: aspectRatioLabel(width, height),
              size: null,
              format: "Uploaded image",
            });
          })
          .catch(() => {
            if (active) setBannerError("Image preview is available, but its dimensions could not be read.");
          });
      }
      setSelected(productsResponse.data?.data || []);
    }).catch(async (error: unknown) => {
      await Swal.fire("Unable to load featured campaign", errorMessage(error), "error");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!editing || previewOnly) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setSearching(true);
      api.get("/campaign/featured-products/search", { params: { search } })
        .then((response) => { if (active) setOptions(response.data?.data || []); })
        .catch(async (error: unknown) => {
          if (active) await Swal.fire("Product search failed", errorMessage(error), "error");
        })
        .finally(() => { if (active) setSearching(false); });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search, editing, previewOnly]);

  const updateForm = <K extends keyof CampaignForm>(key: K, value: CampaignForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const buildCampaignData = (status?: Status) => {
    const data = new FormData();
    data.set("title", form.title.trim());
    data.set("campaign_type", "featured");
    data.set("module", "product");
    data.set("background_type", form.background_type);
    data.set("background_color", form.background_color);
    data.set("gradient_end_color", form.gradient_end_color);
    data.set("text_color", form.text_color);
    data.set("cta_text", form.cta_text.trim());
    data.set("start_at", form.start_at);
    data.set("end_at", form.end_at);
    data.set("display_order", form.display_order);
    if (status) data.set("status", status);
    if (bannerFile && form.background_type === "image") data.append("banner_image", bannerFile);
    return data;
  };

  const validateForm = async () => {
    if (!form.title.trim()) {
      await Swal.fire("Campaign heading required", "Enter a heading for the mobile campaign.", "warning");
      return false;
    }
    if (form.start_at && form.end_at && new Date(form.start_at) >= new Date(form.end_at)) {
      await Swal.fire("Invalid schedule", "End time must be after start time.", "warning");
      return false;
    }
    if (form.background_type === "image" && !bannerFile && !bannerUrl) {
      await Swal.fire("Background image required", "Upload an image or choose a solid or gradient background.", "warning");
      return false;
    }
    if (![form.background_color, form.gradient_end_color, form.text_color].every((color) => /^#[0-9A-Fa-f]{6}$/.test(color))) {
      await Swal.fire("Check the color values", "Use a six-digit HEX color such as #4B0082.", "warning");
      return false;
    }
    if (!form.cta_text.trim()) {
      await Swal.fire("Button text required", "Enter the text to show on the Explore More button.", "warning");
      return false;
    }
    if (!/^\d+$/.test(form.display_order) || !Number.isSafeInteger(Number(form.display_order))) {
      await Swal.fire("Invalid display priority", "Enter a whole number starting at zero.", "warning");
      return false;
    }
    return true;
  };

  const saveCampaign = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!(await validateForm())) return;

    try {
      setSavingCampaign(true);
      const data = buildCampaignData(editing ? form.status : "draft");
      if (editing) {
        await api.put(`/campaign/campaigns/${id}`, data);
        await Swal.fire({ icon: "success", title: "Featured campaign saved", timer: 1200, showConfirmButton: false });
      } else {
        const response = await api.post("/campaign/campaigns", data);
        const campaignId = response.data?.campaign_id;
        if (!campaignId) throw new Error("Campaign was saved but the server did not return its ID.");
        await Swal.fire({ icon: "success", title: "Campaign created", text: "Now select and order its products.", timer: 1600, showConfirmButton: false });
        navigate(routes.manager.featuredProducts.edit.replace(":id", String(campaignId)), { replace: true });
      }
    } catch (error: unknown) {
      await Swal.fire("Unable to save campaign", errorMessage(error), "error");
    } finally {
      setSavingCampaign(false);
    }
  };

  const saveProducts = async () => {
    if (!id) return false;
    try {
      setSavingProducts(true);
      const { data } = await api.put(`/campaign/campaigns/${id}/featured-products`, {
        product_ids: selected.map((product) => product.product_id),
      });
      setSelected(data?.data || []);
      await Swal.fire({ icon: "success", title: "Product order saved", timer: 1100, showConfirmButton: false });
      return true;
    } catch (error: unknown) {
      await Swal.fire("Unable to save products", errorMessage(error), "error");
      return false;
    } finally {
      setSavingProducts(false);
    }
  };

  const publishCampaign = async () => {
    if (!id || publishing || !(await validateForm())) return;
    if (!selected.length) {
      await Swal.fire("Select products first", "Please select at least one available product before publishing.", "warning");
      return;
    }
    const confirmation = await Swal.fire({
      title: form.status === "active" ? "Update live campaign?" : "Publish campaign?",
      text: "The campaign will appear in the mobile app according to its schedule.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: form.status === "active" ? "Save and publish" : "Publish campaign",
      confirmButtonColor: "#852BAF",
    });
    if (!confirmation.isConfirmed) return;

    try {
      setPublishing(true);
      setSavingCampaign(true);
      const campaignData = buildCampaignData();
      await api.put(`/campaign/campaigns/${id}`, campaignData);
      setSavingCampaign(false);
      setSavingProducts(true);
      const { data } = await api.put(`/campaign/campaigns/${id}/featured-products`, {
        product_ids: selected.map((product) => product.product_id),
      });
      if (Array.isArray(data?.data)) setSelected(data.data);
      await api.patch(`/campaign/campaigns/${id}/status`, { status: "active" });
      updateForm("status", "active");
      await Swal.fire({ icon: "success", title: "Campaign published", text: "It will appear in the app when its schedule is active.", timer: 1700, showConfirmButton: false });
    } catch (error: unknown) {
      await Swal.fire("Unable to publish campaign", errorMessage(error), "error");
    } finally {
      setSavingCampaign(false);
      setSavingProducts(false);
      setPublishing(false);
    }
  };

  const setCampaignDraft = async () => {
    if (!id) return;
    const confirmation = await Swal.fire({
      title: "Set campaign to draft?",
      text: "The campaign will stop appearing in the mobile app until it is published again.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Set to draft",
      confirmButtonColor: "#852BAF",
    });
    if (!confirmation.isConfirmed) return;
    try {
      setPublishing(true);
      await api.patch(`/campaign/campaigns/${id}/status`, { status: "draft" });
      updateForm("status", "draft");
      await Swal.fire({ icon: "success", title: "Campaign saved as draft", timer: 1300, showConfirmButton: false });
    } catch (error: unknown) {
      await Swal.fire("Unable to update campaign", errorMessage(error), "error");
    } finally {
      setPublishing(false);
    }
  };

  const toggleProduct = (product: ProductOption, checked: boolean) => {
    setSelected((current) => {
      if (!checked) return current.filter((item) => item.product_id !== product.product_id);
      if (current.some((item) => item.product_id === product.product_id)) return current;
      return [...current, product];
    });
  };

  const moveProduct = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= selected.length) return;
    setSelected((current) => {
      const reordered = [...current];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      return reordered;
    });
    setDraggedIndex(null);
  };

  const onBannerChange = async (file?: File) => {
    setBannerError(null);
    if (!file) return;
    try {
      const metadata = await inspectImageFile(file);
      setBannerMetadata(metadata);
      setBannerFile(file.type ? file : new File([file], file.name, { type: metadata.mimeType }));
    } catch (error: unknown) {
      setBannerError(error instanceof Error ? error.message : "The selected image could not be read.");
    }
  };

  const onBannerDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    void onBannerChange(event.dataTransfer.files?.[0]);
  };

  const changeSelection = (index: number, checked: boolean) => {
    toggleProduct(options[index], checked);
  };

  const moveSelectedProduct = (index: number, direction: -1 | 1) => {
    moveProduct(index, index + direction);
  };

  const effectiveImageUrl = localBannerUrl || bannerUrl;
  const renderColorControls = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      {form.background_type !== "image" && <ColorControl
        label={form.background_type === "gradient" ? "Starting color" : "Background color"}
        value={form.background_color}
        onChange={(value) => updateForm("background_color", value)}
      />}
      {form.background_type === "gradient" && <ColorControl
        label="Ending color"
        value={form.gradient_end_color}
        onChange={(value) => updateForm("gradient_end_color", value)}
      />}
      <ColorControl
        label="Heading and button text color"
        value={form.text_color}
        onChange={(value) => updateForm("text_color", value)}
      />
    </div>
  );

  if (loading) return <div className="grid min-h-64 place-items-center text-sm text-slate-500">Loading featured campaign…</div>;

  if (previewOnly) {
    return <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to={routes.manager.featuredProducts.list} className="inline-flex items-center gap-2 text-sm font-semibold text-[#852BAF]"><FiArrowLeft /> Back to campaigns</Link>
        <Link to={routes.manager.featuredProducts.edit.replace(":id", String(id))} className="rounded-lg bg-[#852BAF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#702393]">Edit campaign</Link>
      </div>
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#852BAF]">Read-only preview</p><h1 className="mt-1 text-2xl font-semibold text-slate-900">{form.title}</h1><p className="mt-1 text-sm text-slate-500">Campaign #{id} · {form.status}</p></div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-semibold text-slate-900">Campaign settings</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs font-medium text-slate-500">Background style</dt><dd className="mt-1 text-sm font-semibold capitalize text-slate-800">{form.background_type}</dd></div>
            <div><dt className="text-xs font-medium text-slate-500">Button text</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{form.cta_text}</dd></div>
            <div><dt className="text-xs font-medium text-slate-500">Starts</dt><dd className="mt-1 text-sm text-slate-800">{form.start_at ? new Date(form.start_at).toLocaleString() : "No start date"}</dd></div>
            <div><dt className="text-xs font-medium text-slate-500">Ends</dt><dd className="mt-1 text-sm text-slate-800">{form.end_at ? new Date(form.end_at).toLocaleString() : "No end date"}</dd></div>
          </dl>
          <p className="mt-4 text-sm text-slate-600">{selected.length} products assigned · first {Math.min(selected.length, 10)} appear on Home</p>
        </section>
        <MobileCampaignPreview form={form} imageUrl={effectiveImageUrl} products={selected} />
      </div>
    </div>;
}

  const backgroundModes: Array<{ value: BackgroundType; label: string; description: string; preview: React.CSSProperties }> = [
    { value: "solid", label: "Solid color", description: "One background color", preview: { backgroundColor: safeColor(form.background_color, "#4B0082") } },
    { value: "gradient", label: "Gradient", description: "Blend two colors", preview: { backgroundImage: `linear-gradient(135deg, ${safeColor(form.background_color, "#4B0082")}, ${safeColor(form.gradient_end_color, "#6A00FF")})` } },
    { value: "image", label: "Background image", description: "Use uploaded artwork", preview: { backgroundColor: "#EDE9FE", backgroundImage: effectiveImageUrl ? `url("${effectiveImageUrl}")` : undefined } },
  ];

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link to={routes.manager.featuredProducts.list} className="inline-flex items-center gap-2 text-sm font-semibold text-[#852BAF] hover:text-[#4B0082]"><FiArrowLeft /> Back to campaigns</Link>
      {editing && <span className="rounded-full bg-purple-50 px-3 py-1.5 text-xs font-semibold text-[#852BAF]">Campaign #{id} · {form.status}</span>}
    </div>
    <header>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#852BAF]">{editing ? "Campaign settings" : "New campaign"}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{editing ? "Edit featured campaign" : "Create featured campaign"}</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">Set the heading, appearance, product order, and schedule that customers see in the mobile app.</p>
    </header>

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <form onSubmit={saveCampaign} className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="mb-5"><h2 className="text-base font-semibold text-slate-900">Campaign details</h2><p className="mt-1 text-sm text-slate-500">Choose a clear heading and a consistent mobile call to action.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="mb-1.5 block text-sm font-semibold text-slate-700">Campaign heading <span className="text-[#FC3F78]">*</span></span><input required maxLength={255} value={form.title} onChange={(event) => updateForm("title", event.target.value)} className={fieldClass} placeholder="For example, Featured This Week" /></label>
            <label><span className="mb-1.5 block text-sm font-semibold text-slate-700">Explore More button text</span><input required maxLength={60} value={form.cta_text} onChange={(event) => updateForm("cta_text", event.target.value)} className={fieldClass} placeholder="Explore More" /></label>
            <label><span className="mb-1.5 block text-sm font-semibold text-slate-700">Display priority</span><input type="number" min="0" step="1" value={form.display_order} onChange={(event) => updateForm("display_order", event.target.value)} className={fieldClass} /><span className="mt-1 block text-xs text-slate-500">Lower numbers are shown first when campaigns overlap.</span></label>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="mb-5"><h2 className="text-base font-semibold text-slate-900">Background appearance</h2><p className="mt-1 text-sm text-slate-500">Choose one style for the mobile campaign section.</p></div>
          <div role="group" aria-label="Background style" className="grid gap-3 sm:grid-cols-3">
            {backgroundModes.map((mode) => {
              const isSelected = form.background_type === mode.value;
              return <button
                key={mode.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => updateForm("background_type", mode.value)}
                className={`rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#852BAF] ${isSelected ? "border-[#852BAF] bg-purple-50 ring-2 ring-purple-100" : "border-slate-200 hover:border-purple-200"}`}
              >
                <span aria-hidden="true" className="mb-2 block h-11 rounded-lg bg-cover bg-center" style={mode.preview} />
                <span className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-800">{mode.label}{isSelected && <FiCheck className="text-[#852BAF]" />}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{mode.description}</span>
              </button>;
            })}
          </div>

          <div className="mt-5 border-t border-slate-100 pt-5">
            {form.background_type === "image" ? <div className="space-y-4">
              <div
                onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onBannerDrop}
                className={`rounded-xl border border-dashed p-4 transition sm:p-5 ${dragOver ? "border-[#852BAF] bg-purple-50" : "border-slate-300 bg-slate-50/70"}`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  {effectiveImageUrl
                    ? <img src={effectiveImageUrl} alt="Campaign background artwork preview" className="h-28 w-full rounded-lg bg-white object-cover sm:w-40" />
                    : <span className="grid h-28 w-full place-items-center rounded-lg bg-purple-50 text-[#852BAF] sm:w-40"><FiImage size={26} /></span>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{bannerFile ? "Artwork ready to save" : bannerUrl ? "Current campaign artwork" : "Drop campaign artwork here"}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">JPG, PNG, or WebP · maximum 5 MB. Uploading a replacement keeps the current image until you save.</p>
                    <label className="mt-3 inline-flex cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-[#852BAF] hover:bg-purple-50 focus-within:ring-2 focus-within:ring-purple-300">
                      {effectiveImageUrl ? "Replace image" : "Choose image"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        aria-label="Choose campaign background image"
                        onChange={(event) => {
                          void onBannerChange(event.currentTarget.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>
              </div>
              {bannerError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{bannerError}</p>}
              {bannerMetadata && <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-xs">
                <p className="font-medium text-slate-700">{bannerMetadata.width} × {bannerMetadata.height} px · {bannerMetadata.aspectRatio} · {bannerMetadata.size === null ? bannerMetadata.format : `${formatFileSize(bannerMetadata.size)} · ${bannerMetadata.format}`}</p>
                {(bannerMetadata.width < 720 || bannerMetadata.height < 900) && <p className="text-amber-700">This image is below the recommended 720 × 900 px preview size and may appear soft.</p>}
                {Math.abs(bannerMetadata.width / bannerMetadata.height - 4 / 5) / (4 / 5) > 0.15 && <p className="text-amber-700">This artwork differs from the recommended 4:5 ratio and may crop in the app preview.</p>}
                {bannerMetadata.size !== null && bannerMetadata.size > RECOMMENDED_IMAGE_SIZE && <p className="text-amber-700">This image is larger than the recommended 800 KB and may take longer to load.</p>}
              </div>}
              <div className="rounded-lg border border-slate-100 bg-white p-3">
                <p className="text-sm font-semibold text-slate-800">Background image guidelines</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Recommended: 1080 × 1350 px · 4:5 · optimized size 150–500 KB. Supported formats: JPG, PNG, WebP. Actual upload limit: 5 MB. Important text and logos should stay away from edges; cropping varies by device.</p>
              </div>
              {renderColorControls()}
              <p className="text-xs text-slate-500">The preview applies a subtle dark overlay to help the selected text color remain readable over the artwork.</p>
            </div> : <div className="space-y-3">
              {renderColorControls()}
              {[
                form.background_color,
                ...(form.background_type === "gradient" ? [form.gradient_end_color] : []),
              ].some((color) => !hasReadableTextContrast(form.text_color, color)) && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">The chosen text color may be hard to read on this background. Adjust the colors to improve contrast.</p>}
            </div>}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="mb-5"><h2 className="text-base font-semibold text-slate-900">Campaign schedule</h2><p className="mt-1 text-sm text-slate-500">Leave dates empty to use a campaign without a time window.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className="mb-1.5 block text-sm font-semibold text-slate-700">Starts at <span className="font-normal text-slate-400">(optional)</span></span><input type="datetime-local" value={form.start_at} onChange={(event) => updateForm("start_at", event.target.value)} className={fieldClass} /></label>
            <label><span className="mb-1.5 block text-sm font-semibold text-slate-700">Ends at <span className="font-normal text-slate-400">(optional)</span></span><input type="datetime-local" min={form.start_at || undefined} value={form.end_at} onChange={(event) => updateForm("end_at", event.target.value)} className={fieldClass} /></label>
          </div>
        </section>

        <div className="flex flex-col-reverse gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-xs leading-5 text-slate-500">{form.status === "active" ? "Saving changes updates this campaign." : "New campaigns are saved as drafts and stay hidden until published."}</p>
          <div className="flex flex-wrap justify-end gap-2">
            {editing && form.status === "active" && <button type="button" disabled={publishing} onClick={() => void setCampaignDraft()} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Set to draft</button>}
            {editing && form.status !== "active" && <button type="button" disabled={publishing || savingCampaign || savingProducts} onClick={() => void publishCampaign()} className="rounded-lg bg-[#852BAF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#702393] disabled:opacity-50">{publishing ? "Publishing…" : "Publish campaign"}</button>}
            <button type="submit" disabled={savingCampaign || publishing} className="inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-white px-4 py-2.5 text-sm font-semibold text-[#852BAF] hover:bg-purple-50 disabled:opacity-50"><FiSave /> {savingCampaign ? "Saving…" : editing ? "Save changes" : "Save as draft"}</button>
          </div>
        </div>
      </form>

      <div className="space-y-5 xl:sticky xl:top-5">
        <MobileCampaignPreview form={form} imageUrl={effectiveImageUrl} products={selected} />
        {editing && <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900">Product visibility</h2>
          <p className="mt-1 text-sm text-slate-600">{selected.length} selected · {Math.min(selected.length, 10)} shown on Home · {selected.length} in Explore More</p>
        </section>}
      </div>
    </div>

    {editing && <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="text-base font-semibold text-slate-900">Product selection and order</h2><p className="mt-1 text-sm text-slate-500">The first 10 products appear on Home; all selected products appear in Explore More.</p><p className="mt-2 text-sm font-semibold text-slate-700">{selected.length} {selected.length === 1 ? "product" : "products"} selected · Home preview: {Math.min(selected.length, 10)} · Explore More: {selected.length}</p></div>
        <button type="button" disabled={savingProducts || publishing} onClick={() => void saveProducts()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#852BAF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#702393] disabled:opacity-50"><FiSave /> {savingProducts ? "Saving order…" : "Save product order"}</button>
      </div>

      {selected.length > 0 ? <ol className="space-y-2">
        {selected.map((product, index) => <Fragment key={product.product_id}>
          {index === 10 && <li key="home-preview-separator" className="my-3 flex items-center gap-3 text-xs font-semibold text-slate-500"><span className="h-px flex-1 bg-slate-200" />Explore More only<span className="h-px flex-1 bg-slate-200" /></li>}
          <li key={product.product_id} draggable onDragStart={() => setDraggedIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => draggedIndex !== null && moveProduct(draggedIndex, index)} onDragEnd={() => setDraggedIndex(null)} className={`flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition ${draggedIndex === index ? "opacity-40" : "hover:border-purple-200"}`}>
            <span aria-label={`Display order ${index + 1}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-50 text-xs font-bold text-slate-500">{index + 1}</span>
            {product.image_url ? <img src={product.image_url} alt="" className="h-11 w-11 shrink-0 rounded-lg bg-slate-50 object-cover" /> : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-purple-50 text-purple-400"><FiImage /></span>}
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{product.product_name || `Product #${product.product_id}`}</p><p className="truncate text-xs text-slate-500">ID {product.product_id} · {product.brand_name || product.category_name || "No brand/category"}</p></div>
            <span className="text-sm font-semibold text-slate-700">{product.sale_price !== null && product.sale_price !== undefined ? `₹${Number(product.sale_price).toFixed(2)}` : "Price unavailable"}</span>
            {product.is_eligible === false && <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">Unavailable</span>}
            <div className="flex items-center gap-1">
              <button type="button" aria-label={`Move ${product.product_name} up`} disabled={index === 0} onClick={() => moveSelectedProduct(index, -1)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-purple-50 hover:text-[#852BAF] disabled:cursor-not-allowed disabled:opacity-30"><FiArrowUp /></button>
              <button type="button" aria-label={`Move ${product.product_name} down`} disabled={index === selected.length - 1} onClick={() => moveSelectedProduct(index, 1)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-purple-50 hover:text-[#852BAF] disabled:cursor-not-allowed disabled:opacity-30"><FiArrowDown /></button>
              <button type="button" aria-label={`Remove ${product.product_name || `product ${product.product_id}`}`} onClick={() => toggleProduct(product, false)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700"><FiTrash2 /></button>
            </div>
          </li>
        </Fragment>)}
      </ol> : <p className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">No products selected yet. Search the catalogue below.</p>}

      <div className="mt-6 border-t border-slate-100 pt-5">
        <div className="mb-3"><h3 className="text-sm font-semibold text-slate-800">Find products</h3><p className="mt-1 text-xs text-slate-500">Search by product name, ID, brand, or category.</p></div>
        <label className="relative block"><span className="sr-only">Search catalogue products</span><FiSearch aria-hidden="true" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search catalogue…" className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100" /></label>
        <div className="mt-3 max-h-80 overflow-auto rounded-xl border border-slate-200">
          {searching ? <p className="p-6 text-center text-sm text-slate-500">Searching products…</p> : options.length ? <ul className="divide-y divide-slate-100">
            {options.map((product, index) => {
              const checked = selected.some((item) => item.product_id === product.product_id);
              return <li key={product.product_id} className="flex items-center gap-3 px-3 py-3 transition hover:bg-purple-50/30 sm:px-4">
                <input type="checkbox" checked={checked} onChange={(event) => changeSelection(index, event.target.checked)} aria-label={`${checked ? "Remove" : "Select"} ${product.product_name}`} className="h-4 w-4 accent-[#852BAF]" />
                {product.image_url ? <img src={product.image_url} alt="" className="h-11 w-11 shrink-0 rounded-lg bg-slate-50 object-cover" /> : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-purple-50 text-purple-400"><FiImage /></span>}
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{product.product_name}</p><p className="truncate text-xs text-slate-500">ID {product.product_id} · {product.brand_name || "No brand"} · {product.category_name || "Uncategorized"}</p></div>
                <span className="shrink-0 text-sm font-semibold text-slate-700">{product.sale_price !== null && product.sale_price !== undefined ? `₹${Number(product.sale_price).toFixed(2)}` : "—"}</span>
              </li>;
            })}
          </ul> : <p className="p-6 text-center text-sm text-slate-500">{search ? "No available products matched your search." : "Search the catalogue to add available products."}</p>}
        </div>
      </div>
    </section>}
  </div>;
}
