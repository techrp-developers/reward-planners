import { useState } from "react";
import { FiTrash2, FiX } from "react-icons/fi";
import { toast } from "sonner";
import type { ModulePlacement } from "../../api/ModuleIconApi";
import { PLACEMENT_OPTIONS, createModule } from "../../api/ModuleIconApi";
import ColorPickerField from "./ColorPickerField";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

const MODULE_KEY_PATTERN = /^[a-z0-9_-]{2,50}$/;
const inputClass = "mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-purple-400 focus:ring-4 focus:ring-purple-100";
const labelClass = "text-xs font-bold text-slate-500";

function IconFileField({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className={labelClass}>
      {label}
      <div className="mt-2 flex items-center gap-2">
        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
          className="block min-w-0 flex-1 text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-purple-50 file:px-2.5 file:py-2 file:text-[11px] file:font-bold file:text-[#852BAF]"
        />
        {file && (
          <button
            type="button"
            onClick={() => onChange(null)}
            title={`Remove selected ${label.toLowerCase()}`}
            className="rounded-lg border border-red-100 bg-red-50 p-2 text-red-500 hover:bg-red-100"
          >
            <FiTrash2 size={14} />
          </button>
        )}
      </div>
      {file && <p className="mt-1 truncate text-[11px] text-slate-400">{file.name}</p>}
    </label>
  );
}

export default function AddModuleModal({ onClose, onCreated }: Props) {
  const [moduleKey, setModuleKey] = useState("");
  const [label, setLabel] = useState("");
  const [placement, setPlacement] = useState<ModulePlacement>("both");
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [activeIconFile, setActiveIconFile] = useState<File | null>(null);
  const [dashboardIconFile, setDashboardIconFile] = useState<File | null>(null);
  const [normalColor, setNormalColor] = useState<string | null>(null);
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [gradientStart, setGradientStart] = useState<string | null>(null);
  const [gradientEnd, setGradientEnd] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    const key = moduleKey.trim().toLowerCase();

    if (!MODULE_KEY_PATTERN.test(key)) {
      setError("Module Key must be 2-50 characters: lowercase letters, numbers, underscore, or hyphen only.");
      return;
    }
    if (!label.trim()) {
      setError("Display Name is required.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("module_key", key);
      fd.append("label", label.trim());
      fd.append("placement", placement);
      fd.append("sort_order", String(sortOrder));
      fd.append("is_active", String(isActive));
      // Gated by the current placement too, not just file presence - a file picked before
      // switching placement away from its section must never be sent for the new placement.
      const showDashboard = placement === "both" || placement === "dashboard";
      const showNavbar = placement === "both" || placement === "navbar";
      if (showNavbar && iconFile) fd.append("icon", iconFile);
      if (showNavbar && activeIconFile) fd.append("active_icon", activeIconFile);
      if (showDashboard && dashboardIconFile) fd.append("dashboard_icon", dashboardIconFile);
      fd.append("normal_color", normalColor || "");
      fd.append("active_color", activeColor || "");
      fd.append("gradient_start_color", gradientStart || "");
      fd.append("gradient_end_color", gradientEnd || "");

      await createModule(fd);
      toast.success("Module created successfully");
      onCreated();
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to create module";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-[440px] max-w-[92vw] rounded-3xl bg-white p-7 shadow-2xl">
        <button onClick={onClose} className="absolute right-5 top-5 text-slate-400 hover:text-slate-700">
          <FiX size={20} />
        </button>

        <h2 className="text-xl font-black text-slate-900">Add Module</h2>
        <p className="mt-1 text-xs text-slate-400">Creates a new module that appears in the mobile navbar. It won't be tappable in the app until a developer links a screen to it.</p>

        <div className="mt-5 space-y-4">
          <label className={labelClass}>
            Module Key
            <input
              value={moduleKey}
              onChange={(event) => setModuleKey(event.target.value)}
              placeholder="e.g. travel"
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-slate-400">Lowercase letters, numbers, underscore, or hyphen. Can't be changed after creation.</p>
          </label>

          <label className={labelClass}>
            Display Name
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="e.g. Travel"
              className={inputClass}
            />
          </label>

          <div>
            <p className={labelClass}>Module Placement</p>
            <div className="mt-2 flex flex-wrap gap-1 rounded-xl border border-purple-100 bg-white p-1 shadow-sm">
              {PLACEMENT_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setPlacement(option.key)}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${placement === option.key ? "bg-[#852BAF] text-white shadow" : "text-slate-500 hover:bg-purple-50"}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className={labelClass}>Module Icons</p>
            <p className="mt-1 text-[11px] text-slate-400">
              Dashboard Icon, Navbar Normal Icon, and Navbar Active Icon are independent artwork - upload different images for each when they should look different.
            </p>
            <div className="mt-3 space-y-4">
              {(placement === "both" || placement === "dashboard") && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-purple-400">Dashboard</p>
                  <div className="mt-2">
                    <IconFileField label="Dashboard Icon" file={dashboardIconFile} onChange={setDashboardIconFile} />
                  </div>
                </div>
              )}
              {(placement === "both" || placement === "navbar") && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-purple-400">Navbar</p>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <IconFileField label="Navbar Normal Icon" file={iconFile} onChange={setIconFile} />
                    <IconFileField label="Navbar Active Icon" file={activeIconFile} onChange={setActiveIconFile} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ColorPickerField label="Normal Color" value={normalColor} onChange={setNormalColor} />
            <ColorPickerField label="Active Color" value={activeColor} onChange={setActiveColor} />
          </div>

          <div>
            <p className={labelClass}>Active Gradient (optional, overrides Active Color)</p>
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

          <div className="flex items-end justify-between gap-4">
            <label className={labelClass}>
              Sort Order
              <input
                type="number"
                min={0}
                value={sortOrder}
                onChange={(event) => setSortOrder(Number(event.target.value) || 0)}
                className={`${inputClass} w-24`}
              />
            </label>

            <label className="mb-2.5 flex items-center gap-2 text-xs font-bold text-slate-500">
              <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-[#852BAF] focus:ring-purple-300" />
              Active
            </label>
          </div>

          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-5">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#852BAF] to-[#FC3F78] px-5 py-2.5 text-sm font-extrabold text-white shadow disabled:opacity-50"
          >
            {saving ? "Creating..." : "Create Module"}
          </button>
        </div>
      </div>
    </div>
  );
}
