import { useEffect, useState } from "react";
import { FiCheckCircle, FiTrash2, FiUploadCloud, FiXCircle } from "react-icons/fi";
import { toast } from "sonner";
import { confirmDialog } from "../../../../../common/utils/confirmDialog";
import type { ApiModuleIcon } from "../../api/ModuleIconApi";
import { deleteModule, updateModuleIcon } from "../../api/ModuleIconApi";
import ColorPickerField from "./ColorPickerField";

interface Props {
  module: ApiModuleIcon;
  onSaved: () => void;
}

const ICON_ACCEPT = "image/png,image/jpeg,image/svg+xml";

export default function ModuleIconCard({ module, onSaved }: Props) {
  const [label, setLabel] = useState(module.label);
  const [sortOrder, setSortOrder] = useState(module.sort_order);
  const [isActive, setIsActive] = useState(!!module.is_active);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [activeIconFile, setActiveIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [activeIconPreview, setActiveIconPreview] = useState<string | null>(null);
  const [normalColor, setNormalColor] = useState<string | null>(module.normal_color);
  const [activeColor, setActiveColor] = useState<string | null>(module.active_color);
  const [gradientStart, setGradientStart] = useState<string | null>(module.gradient_start_color);
  const [gradientEnd, setGradientEnd] = useState<string | null>(module.gradient_end_color);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Keep the form in sync when the server confirms a save (e.g. after invalidation) -
  // but never clobber an in-progress edit the admin hasn't saved yet.
  useEffect(() => {
    if (saving) return;
    setLabel(module.label);
    setSortOrder(module.sort_order);
    setIsActive(!!module.is_active);
    setNormalColor(module.normal_color);
    setActiveColor(module.active_color);
    setGradientStart(module.gradient_start_color);
    setGradientEnd(module.gradient_end_color);
  }, [
    module.label,
    module.sort_order,
    module.is_active,
    module.normal_color,
    module.active_color,
    module.gradient_start_color,
    module.gradient_end_color,
    saving,
  ]);

  useEffect(() => {
    return () => {
      if (iconPreview) URL.revokeObjectURL(iconPreview);
      if (activeIconPreview) URL.revokeObjectURL(activeIconPreview);
    };
  }, [iconPreview, activeIconPreview]);

  const handlePickIcon = (file: File | undefined, kind: "icon" | "active") => {
    if (!file) return;
    const url = URL.createObjectURL(file);

    if (kind === "icon") {
      if (iconPreview) URL.revokeObjectURL(iconPreview);
      setIconFile(file);
      setIconPreview(url);
    } else {
      if (activeIconPreview) URL.revokeObjectURL(activeIconPreview);
      setActiveIconFile(file);
      setActiveIconPreview(url);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("label", label);
      fd.append("sort_order", String(sortOrder));
      fd.append("is_active", String(isActive));
      if (iconFile) fd.append("icon", iconFile);
      if (activeIconFile) fd.append("active_icon", activeIconFile);
      fd.append("normal_color", normalColor || "");
      fd.append("active_color", activeColor || "");
      fd.append("gradient_start_color", gradientStart || "");
      fd.append("gradient_end_color", gradientEnd || "");

      await updateModuleIcon(module.module_key, fd);

      if (iconPreview) URL.revokeObjectURL(iconPreview);
      if (activeIconPreview) URL.revokeObjectURL(activeIconPreview);
      setIconFile(null);
      setActiveIconFile(null);
      setIconPreview(null);
      setActiveIconPreview(null);

      toast.success("Module icon updated successfully");
      onSaved();
    } catch (err) {
      toast.error("Failed to update module icon");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirmDialog({
      title: `Delete "${module.label}"?`,
      text: "This module icon will be removed from the CMS navbar list.",
      confirmButtonText: "Delete",
      cancelButtonText: "Cancel",
      confirmButtonColor: "#DC2626",
    });

    if (!confirmed) return;

    setDeleting(true);
    try {
      await deleteModule(module.module_key);
      toast.success("Module deleted successfully");
      onSaved();
    } catch (err) {
      toast.error("Failed to delete module");
    } finally {
      setDeleting(false);
    }
  };

  const displayIconUrl = iconPreview || module.icon_url;
  const displayActiveIconUrl = activeIconPreview || module.active_icon_url;

  return (
    <div className="rounded-3xl border border-purple-100 bg-white p-6 shadow-[0_18px_55px_rgba(67,31,91,0.08)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{module.module_key}</p>
          <h3 className="text-lg font-black text-slate-900">{label || module.label}</h3>
          {!module.route_key && (
            <p className="mt-0.5 text-[10px] font-semibold text-amber-600">Not linked to a mobile screen yet - displays only, not tappable</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsActive((prev) => !prev)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
        >
          {isActive ? <FiCheckCircle /> : <FiXCircle />}
          {isActive ? "Active" : "Inactive"}
        </button>
      </div>

      <div className="mt-4 grid place-items-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-6">
        {displayIconUrl ? (
          <img src={displayIconUrl} alt="" className="h-16 w-16 object-contain" />
        ) : (
          <span className="text-xs font-semibold text-slate-400">No icon uploaded</span>
        )}
      </div>

      <label className="mt-4 block text-xs font-bold text-slate-500">
        Label
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100"
        />
      </label>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <ColorPickerField label="Normal Color" value={normalColor} onChange={setNormalColor} />
        <ColorPickerField label="Active Color" value={activeColor} onChange={setActiveColor} />
      </div>

      <div className="mt-4">
        <p className="text-xs font-bold text-slate-500">Active Gradient (optional, overrides Active Color)</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <ColorPickerField label="Gradient Start" value={gradientStart} onChange={setGradientStart} />
          <ColorPickerField label="Gradient End" value={gradientEnd} onChange={setGradientEnd} />
        </div>
        {(gradientStart || gradientEnd) && (
          <div
            className="mt-3 h-8 w-full rounded-lg border border-slate-200"
            style={{ background: `linear-gradient(135deg, ${gradientStart || "#e2e8f0"}, ${gradientEnd || "#e2e8f0"})` }}
          />
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs font-bold text-slate-500">Normal Icon</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              {displayIconUrl ? (
                <img src={displayIconUrl} alt="" className="h-full w-full object-contain" />
              ) : (
                <FiUploadCloud className="text-slate-300" />
              )}
            </span>
            <label className="cursor-pointer rounded-lg bg-purple-50 px-2.5 py-2 text-[11px] font-bold text-[#852BAF] hover:bg-purple-100">
              Upload
              <input
                type="file"
                accept={ICON_ACCEPT}
                className="hidden"
                onChange={(event) => handlePickIcon(event.target.files?.[0], "icon")}
              />
            </label>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-500">Active Icon</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              {displayActiveIconUrl ? (
                <img src={displayActiveIconUrl} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="px-1 text-center text-[9px] font-semibold text-slate-400">Same as normal icon</span>
              )}
            </span>
            <label className="cursor-pointer rounded-lg bg-purple-50 px-2.5 py-2 text-[11px] font-bold text-[#852BAF] hover:bg-purple-100">
              Upload
              <input
                type="file"
                accept={ICON_ACCEPT}
                className="hidden"
                onChange={(event) => handlePickIcon(event.target.files?.[0], "active")}
              />
            </label>
          </div>
        </div>
      </div>

      <label className="mt-4 block text-xs font-bold text-slate-500">
        Sort Order
        <input
          type="number"
          min={0}
          value={sortOrder}
          onChange={(event) => setSortOrder(Number(event.target.value) || 0)}
          className="mt-2 w-24 rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100"
        />
      </label>

      <div className="mt-5 flex justify-between gap-3 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={() => void handleDelete()}
          disabled={saving || deleting}
          className="inline-flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-2.5 text-sm font-extrabold text-red-600 transition hover:bg-red-100 disabled:opacity-50"
        >
          <FiTrash2 />
          {deleting ? "Deleting..." : "Delete"}
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || deleting}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-5 py-2.5 text-sm font-extrabold text-white shadow disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
