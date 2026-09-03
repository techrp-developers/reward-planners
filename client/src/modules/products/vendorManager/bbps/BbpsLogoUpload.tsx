import { useEffect, useRef, useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { FiEdit2, FiImage, FiUploadCloud, FiX } from "react-icons/fi";
import { api } from "../../../../common/api/api";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE = 3 * 1024 * 1024;

interface UploadedLogo {
  operator_id: string; operator_name: string; logo_url: string; logo_alt: string;
  created_at: string; updated_at: string;
}

export default function BbpsLogoUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [operatorId, setOperatorId] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [altText, setAltText] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedLogos, setUploadedLogos] = useState<UploadedLogo[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadUploadedLogos = async () => {
    try {
      setLoadingList(true);
      const response = await api.get("/v1/bills/operators/logos");
      setUploadedLogos(response.data.data || []);
    } catch (error) {
      const message = axios.isAxiosError(error) ? error.response?.data?.message : null;
      void Swal.fire("Could not load logos", message || "The uploaded operator list could not be loaded.", "error");
    } finally { setLoadingList(false); }
  };

  useEffect(() => { void loadUploadedLogos(); }, []);
  useEffect(() => {
    if (!logo) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(logo); setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  const clearLogo = () => { setLogo(null); if (fileInputRef.current) fileInputRef.current.value = ""; };
  const resetForm = () => { setEditingId(null); setOperatorId(""); setOperatorName(""); setAltText(""); clearLogo(); };
  const selectLogo = (file?: File) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) { void Swal.fire("Unsupported image", "Choose a PNG, JPEG, or WebP logo.", "warning"); return; }
    if (file.size > MAX_FILE_SIZE) { void Swal.fire("Image too large", "The logo must be 3 MB or smaller.", "warning"); return; }
    setLogo(file);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!operatorId.trim() || !operatorName.trim() || (!logo && !editingId)) {
      await Swal.fire("Missing details", "Operator ID, operator name, and logo are required.", "warning"); return;
    }
    const payload = new FormData();
    payload.set("operator_id", operatorId.trim()); payload.set("operator_name", operatorName.trim());
    if (altText.trim()) payload.set("alt_text", altText.trim());
    if (logo) payload.set("logo", logo);
    try {
      setUploading(true); await api.post("/v1/bills/operators/logo", payload);
      await Swal.fire({ icon: "success", title: editingId ? "Logo updated" : "Logo uploaded", timer: 1600, showConfirmButton: false });
      resetForm(); await loadUploadedLogos();
    } catch (error) {
      const message = axios.isAxiosError(error) ? error.response?.data?.message : null;
      await Swal.fire("Save failed", message || "The operator logo could not be saved.", "error");
    } finally { setUploading(false); }
  };

  const editLogo = (item: UploadedLogo) => {
    setEditingId(item.operator_id); setOperatorId(item.operator_id); setOperatorName(item.operator_name || "");
    setAltText(item.logo_alt || ""); clearLogo(); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const currentLogo = uploadedLogos.find((item) => item.operator_id === editingId)?.logo_url;

  return <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
    <header><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#852BAF]">Operator management</p><h1 className="mt-1 text-2xl font-black text-gray-900 sm:text-3xl">BBPS operator logos</h1><p className="mt-2 max-w-2xl text-sm text-gray-500">Upload and manage logos using the exact operator ID returned by EKO.</p></header>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form onSubmit={submit} className="rounded-3xl border border-purple-100 bg-white p-5 shadow-sm sm:p-7">
        {editingId && <div className="mb-5 flex items-center justify-between rounded-xl bg-purple-50 px-4 py-3 text-sm font-bold text-[#852BAF]"><span>Editing operator {editingId}</span><button type="button" onClick={resetForm} className="rounded-lg px-2 py-1 hover:bg-white">Cancel</button></div>}
        <div className="grid gap-5 sm:grid-cols-2">
          <label><span className="mb-2 block text-sm font-bold text-gray-700">Operator ID *</span><input value={operatorId} onChange={(e) => setOperatorId(e.target.value)} readOnly={Boolean(editingId)} maxLength={64} placeholder="Example: 123" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100 read-only:bg-gray-50" /></label>
          <label><span className="mb-2 block text-sm font-bold text-gray-700">Operator name *</span><input value={operatorName} onChange={(e) => setOperatorName(e.target.value)} maxLength={255} placeholder="Example: Airtel Prepaid" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100" /></label>
        </div>
        <label className="mt-5 block"><span className="mb-2 block text-sm font-bold text-gray-700">Alternative text</span><input value={altText} onChange={(e) => setAltText(e.target.value)} maxLength={255} placeholder="Optional; defaults to the operator name" className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100" /></label>
        <div className="mt-5"><span className="mb-2 block text-sm font-bold text-gray-700">Logo image {editingId ? "(optional)" : "*"}</span><input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => selectLogo(e.target.files?.[0])} className="hidden" />
          {logo && previewUrl ? <div className="flex items-center gap-4 rounded-2xl border border-purple-100 bg-purple-50/40 p-4"><div className="grid h-20 w-20 shrink-0 place-items-center rounded-xl bg-white p-2"><img src={previewUrl} alt="Selected preview" className="max-h-full max-w-full object-contain" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{logo.name}</p><p className="text-xs text-gray-500">{(logo.size / 1024).toFixed(1)} KB</p></div><button type="button" onClick={clearLogo} className="p-2 text-gray-400 hover:text-red-500"><FiX /></button></div>
          : editingId ? <button type="button" onClick={() => fileInputRef.current?.click()} className="flex w-full items-center gap-4 rounded-2xl border border-purple-100 bg-purple-50/30 p-4 text-left hover:border-[#852BAF]"><img src={currentLogo} alt="Current logo" className="h-16 w-16 rounded-xl bg-white object-contain p-2" /><span><b className="block text-sm">Keep current logo</b><span className="text-xs text-gray-500">Click to choose a replacement</span></span></button>
          : <button type="button" onClick={() => fileInputRef.current?.click()} className="flex w-full flex-col items-center rounded-2xl border-2 border-dashed border-purple-200 bg-purple-50/30 px-6 py-10 hover:border-[#852BAF]"><FiUploadCloud className="text-3xl text-[#852BAF]" /><b className="mt-3 text-sm">Choose a logo</b><span className="mt-1 text-xs text-gray-500">PNG, JPEG or WebP · maximum 3 MB</span></button>}
        </div>
        <button type="submit" disabled={uploading} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-purple-200 disabled:opacity-60 sm:w-auto"><FiUploadCloud />{uploading ? "Saving..." : editingId ? "Save changes" : "Upload logo"}</button>
      </form>
      <aside className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-purple-50 text-[#852BAF]"><FiImage size={22} /></div><h2 className="mt-4 font-extrabold">Before uploading</h2><ul className="mt-3 space-y-3 text-sm text-gray-500"><li>Use the exact EKO operator ID.</li><li>Prefer a transparent PNG or WebP.</li><li>Edit a row to update its details or image.</li></ul></aside>
    </div>
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-end justify-between gap-4"><div><h2 className="text-lg font-extrabold">Uploaded operators</h2><p className="mt-1 text-sm text-gray-500">Newest records are shown first by created date.</p></div><span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-[#852BAF]">{uploadedLogos.length} total</span></div>
      {loadingList ? <p className="py-10 text-center text-sm text-gray-500">Loading uploaded operators...</p> : uploadedLogos.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">No operator logos have been uploaded yet.</p> : <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="border-b border-gray-100 text-xs uppercase tracking-wider text-gray-400"><tr><th className="px-3 py-3">Logo</th><th className="px-3 py-3">Operator</th><th className="px-3 py-3">Operator ID</th><th className="px-3 py-3">Created date</th><th className="px-3 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-gray-100">{uploadedLogos.map((item) => <tr key={item.operator_id} className="hover:bg-gray-50/60"><td className="px-3 py-3"><img src={item.logo_url} alt={item.logo_alt} className="h-12 w-12 rounded-lg border object-contain p-1" /></td><td className="px-3 py-3 font-bold">{item.operator_name}</td><td className="px-3 py-3 text-gray-500">{item.operator_id}</td><td className="px-3 py-3 text-gray-500">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}</td><td className="px-3 py-3 text-right"><button type="button" onClick={() => editLogo(item)} className="inline-flex items-center gap-2 rounded-lg border border-purple-100 px-3 py-2 font-bold text-[#852BAF] hover:bg-purple-50"><FiEdit2 /> Edit</button></td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
