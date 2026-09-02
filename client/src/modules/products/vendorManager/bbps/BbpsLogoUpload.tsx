import { useEffect, useRef, useState } from "react";
import axios from "axios";
import Swal from "sweetalert2";
import { FiCheckCircle, FiImage, FiUploadCloud, FiX } from "react-icons/fi";
import { api } from "../../../../common/api/api";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE = 3 * 1024 * 1024;

interface UploadedLogo {
  operator_id: string;
  operator_name: string;
  logo_url: string;
  logo_alt: string;
}

export default function BbpsLogoUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [operatorId, setOperatorId] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [altText, setAltText] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedLogo, setUploadedLogo] = useState<UploadedLogo | null>(null);

  useEffect(() => {
    if (!logo) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(logo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

  const selectLogo = (file?: File) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      void Swal.fire("Unsupported image", "Choose a PNG, JPEG, or WebP logo.", "warning");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      void Swal.fire("Image too large", "The logo must be 3 MB or smaller.", "warning");
      return;
    }
    setUploadedLogo(null);
    setLogo(file);
  };

  const clearLogo = () => {
    setLogo(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!operatorId.trim() || !operatorName.trim() || !logo) {
      await Swal.fire("Missing details", "Operator ID, operator name, and logo are required.", "warning");
      return;
    }

    const payload = new FormData();
    payload.set("operator_id", operatorId.trim());
    payload.set("operator_name", operatorName.trim());
    if (altText.trim()) payload.set("alt_text", altText.trim());
    payload.set("logo", logo);

    try {
      setUploading(true);
      const response = await api.post("/v1/bills/operators/logo", payload);
      setUploadedLogo(response.data.data);
      await Swal.fire({
        icon: "success",
        title: "Logo uploaded",
        text: `${operatorName.trim()} is now mapped to operator ${operatorId.trim()}.`,
        timer: 1800,
        showConfirmButton: false,
      });
      setOperatorId("");
      setOperatorName("");
      setAltText("");
      clearLogo();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message
        : null;
      await Swal.fire("Upload failed", message || "The logo could not be uploaded.", "error");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#852BAF]">Temporary utility</p>
        <h1 className="mt-1 text-2xl font-black text-gray-900 sm:text-3xl">BBPS operator logos</h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-500">
          Map one operator logo at a time using the exact operator ID returned by EKO.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={submit} className="rounded-3xl border border-purple-100 bg-white p-5 shadow-sm sm:p-7">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-gray-700">Operator ID *</span>
              <input
                value={operatorId}
                onChange={(event) => setOperatorId(event.target.value)}
                maxLength={64}
                placeholder="Example: 123"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-gray-700">Operator name *</span>
              <input
                value={operatorName}
                onChange={(event) => setOperatorName(event.target.value)}
                maxLength={255}
                placeholder="Example: Airtel Prepaid"
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100"
              />
            </label>
          </div>

          <label className="mt-5 block">
            <span className="mb-2 block text-sm font-bold text-gray-700">Alternative text</span>
            <input
              value={altText}
              onChange={(event) => setAltText(event.target.value)}
              maxLength={255}
              placeholder="Optional; defaults to the operator name"
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-[#852BAF] focus:ring-4 focus:ring-purple-100"
            />
          </label>

          <div className="mt-5">
            <span className="mb-2 block text-sm font-bold text-gray-700">Logo image *</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => selectLogo(event.target.files?.[0])}
              className="hidden"
            />

            {logo && previewUrl ? (
              <div className="flex items-center gap-4 rounded-2xl border border-purple-100 bg-purple-50/40 p-4">
                <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-white bg-white p-2 shadow-sm">
                  <img src={previewUrl} alt="Selected logo preview" className="max-h-full max-w-full object-contain" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-800">{logo.name}</p>
                  <p className="mt-1 text-xs text-gray-500">{(logo.size / 1024).toFixed(1)} KB</p>
                </div>
                <button type="button" onClick={clearLogo} className="rounded-full p-2 text-gray-400 hover:bg-white hover:text-red-500" aria-label="Remove selected logo">
                  <FiX size={18} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-purple-200 bg-purple-50/30 px-6 py-10 text-center transition hover:border-[#852BAF] hover:bg-purple-50"
              >
                <FiUploadCloud className="text-3xl text-[#852BAF]" />
                <span className="mt-3 text-sm font-bold text-gray-800">Choose a logo</span>
                <span className="mt-1 text-xs text-gray-500">PNG, JPEG or WebP · maximum 3 MB</span>
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-5 py-3 text-sm font-extrabold text-white shadow-lg shadow-purple-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:w-auto"
          >
            <FiUploadCloud size={18} />
            {uploading ? "Uploading…" : "Upload logo"}
          </button>
        </form>

        <aside className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-purple-50 text-[#852BAF]">
            <FiImage size={22} />
          </div>
          <h2 className="mt-4 text-base font-extrabold text-gray-900">Before uploading</h2>
          <ul className="mt-3 space-y-3 text-sm text-gray-500">
            <li>Use the exact EKO operator ID.</li>
            <li>Prefer a transparent PNG or WebP.</li>
            <li>Uploading the same ID replaces its mapping.</li>
          </ul>

          {uploadedLogo && (
            <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-sm font-extrabold text-emerald-700">
                <FiCheckCircle /> Latest upload
              </div>
              <div className="mt-3 grid h-24 place-items-center rounded-xl bg-white p-3">
                <img src={uploadedLogo.logo_url} alt={uploadedLogo.logo_alt} className="max-h-full max-w-full object-contain" />
              </div>
              <p className="mt-3 truncate text-sm font-bold text-gray-800">{uploadedLogo.operator_name}</p>
              <p className="text-xs text-gray-500">ID: {uploadedLogo.operator_id}</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
